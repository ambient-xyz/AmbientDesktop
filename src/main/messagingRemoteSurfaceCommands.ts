import type {
  MessagingAmbientSurface,
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayQueuedProjection,
  MessagingGatewayRuntimeStatus,
  MessagingInboundEvent,
  MessagingProjection,
  RuntimeSurfaceApprovalResponseMode,
  RuntimeSurfaceSnapshot,
} from "../shared/messagingGateway";
import type {
  AnswerWorkflowDiscoveryQuestionInput,
  CollaborationMode,
  ThinkingLevel,
  WorkflowRecoveryAction,
  WorkflowDiscoveryQuestion,
} from "../shared/types";
import {
  messagingProjectionText,
  routeMessagingInboundEvent,
} from "./messagingGatewayProjection";

export type MessagingRemoteSurfaceCommandKind =
  | "show_status"
  | "help"
  | "switch_surface"
  | "open_project"
  | "switch_project"
  | "create_project"
  | "open_chat"
  | "create_chat"
  | "open_workflow"
  | "create_workflow"
  | "answer_workflow_question"
  | "workflow_action"
  | "respond_approval"
  | "revoke_permission_grant"
  | "update_setting"
  | "unsupported";

export type MessagingRemoteSurfaceCommandStatus = "ready" | "blocked";

export type MessagingRemoteSurfaceCommandApplyStatus = "applied" | "blocked" | "denied" | "noop";

export interface MessagingRemoteSurfaceCommandToolInput {
  queuedProjectionId: string;
  commandText?: string;
}

export interface MessagingRemoteSurfaceCommandBindingUpdate {
  bindingId: string;
  ambientSurface: MessagingAmbientSurface;
  projectId?: string | null;
  workflowId?: string | null;
  chatThreadId?: string | null;
  reason: string;
}

export interface MessagingRemoteSurfaceSettingUpdateRequest {
  settingKey: "voice" | "search" | "stt" | "media" | "thread" | "planner";
  operation: "voice_policy" | "search_preference" | "stt_policy" | "media_playback" | "thread_settings" | "planner_finalization";
  threadId?: string;
  threadTitle?: string;
  field?: string;
  value?: string | number | boolean;
  providerAlias?: string;
  mode?: "prefer" | "require";
  fallback?: "allow" | "block";
  clear?: boolean;
  reason: string;
}

export interface MessagingRemoteSurfaceSettingUpdateResult {
  settingKey: "voice" | "search" | "stt" | "media" | "thread" | "planner";
  operation: "voice_policy" | "search_preference" | "stt_policy" | "media_playback" | "thread_settings" | "planner_finalization";
  changed: boolean;
  text: string;
  previousSummary?: string;
  nextSummary?: string;
}

export interface MessagingRemoteSurfaceApprovalResponseRequest {
  requestId: string;
  title: string;
  response: RuntimeSurfaceApprovalResponseMode;
  reason: string;
}

export interface MessagingRemoteSurfacePermissionGrantRevokeRequest {
  grantId: string;
  targetLabel: string;
  reason: string;
}

export interface MessagingRemoteSurfaceWorkflowCreateRequest {
  title?: string;
  initialRequest: string;
  projectPath?: string;
  reason: string;
}

export type MessagingRemoteSurfaceWorkflowActionKind =
  | "run_exploration"
  | "compile_preview"
  | "approve_artifact"
  | "reject_artifact"
  | "cancel_run"
  | "retry_failed_step"
  | "resume_checkpoint"
  | "skip_failed_item";

export interface MessagingRemoteSurfaceWorkflowActionRequest {
  action: MessagingRemoteSurfaceWorkflowActionKind;
  workflowThreadId: string;
  workflowTitle: string;
  reason: string;
  artifactId?: string;
  runId?: string;
  eventId?: string;
  graphNodeId?: string;
  itemKey?: string;
  recoveryAction?: WorkflowRecoveryAction;
}

export interface MessagingRemoteSurfaceWorkflowActionResult {
  action: MessagingRemoteSurfaceWorkflowActionKind;
  workflowThreadId: string;
  workflowTitle: string;
  changed: boolean;
  text: string;
  traceId?: string;
  graphSnapshotId?: string;
  artifactId?: string;
  artifactStatus?: string;
  runId?: string;
  runStatus?: string;
}

export interface MessagingRemoteSurfaceProjectCreateRequest {
  name?: string;
  workspacePath?: string;
  reason: string;
}

export interface MessagingRemoteSurfaceCommandPreview {
  status: MessagingRemoteSurfaceCommandStatus;
  canApplyNow: boolean;
  queuedProjectionId: string;
  commandText: string;
  commandKind: MessagingRemoteSurfaceCommandKind;
  approvalRequired: boolean;
  wouldPersistBinding: boolean;
  wouldReadProviderMessages: false;
  wouldSendProviderMessages: false;
  blockers: string[];
  policyNotes: string[];
  nextSteps: string[];
  textPreview: string;
  queuedProjection?: MessagingGatewayQueuedProjection;
  binding?: MessagingBindingDescriptor;
  event?: MessagingInboundEvent;
  targetSurface?: MessagingAmbientSurface;
  targetProject?: RuntimeSurfaceSnapshot["projects"][number];
  targetProjectCreate?: MessagingRemoteSurfaceProjectCreateRequest;
  targetChat?: RuntimeSurfaceSnapshot["chats"][number];
  newChatTitle?: string;
  targetWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  targetWorkflowCreate?: MessagingRemoteSurfaceWorkflowCreateRequest;
  targetWorkflowAction?: MessagingRemoteSurfaceWorkflowActionRequest;
  targetQuestionId?: string;
  answerChoiceId?: string;
  answerFreeform?: string;
  targetApproval?: RuntimeSurfaceSnapshot["pendingApprovals"][number];
  targetApprovalResponse?: MessagingRemoteSurfaceApprovalResponseRequest;
  targetPermissionGrant?: RuntimeSurfaceSnapshot["permissionGrants"][number];
  targetGrantRevoke?: MessagingRemoteSurfacePermissionGrantRevokeRequest;
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
}

export interface MessagingRemoteSurfaceCommandResult extends MessagingRemoteSurfaceCommandPreview {
  applyStatus: MessagingRemoteSurfaceCommandApplyStatus;
  applied: boolean;
  approvalRecorded: boolean;
  updatedBinding?: MessagingBindingDescriptor;
  scheduledProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
  completedProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
  createdProject?: RuntimeSurfaceSnapshot["projects"][number];
  createdChat?: RuntimeSurfaceSnapshot["chats"][number];
  createdWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  answeredQuestion?: WorkflowDiscoveryQuestion;
  workflowActionResult?: MessagingRemoteSurfaceWorkflowActionResult;
  respondedApproval?: MessagingRemoteSurfaceApprovalResponseRequest;
  revokedPermissionGrant?: MessagingRemoteSurfacePermissionGrantRevokeRequest;
  updatedSetting?: MessagingRemoteSurfaceSettingUpdateResult;
  projection?: MessagingProjection;
}

export function messagingRemoteSurfaceCommandInput(raw: unknown): MessagingRemoteSurfaceCommandToolInput {
  const value = raw as { queuedProjectionId?: unknown; commandText?: unknown } | undefined;
  const queuedProjectionId = optionalString(value?.queuedProjectionId);
  if (!queuedProjectionId) throw new Error("queuedProjectionId is required.");
  const commandText = optionalString(value?.commandText);
  return {
    queuedProjectionId,
    ...(commandText ? { commandText } : {}),
  };
}

export function buildMessagingRemoteSurfaceCommandPreview(input: {
  toolInput: MessagingRemoteSurfaceCommandToolInput;
  bindings: MessagingBindingListResult;
  runtimeStatus: MessagingGatewayRuntimeStatus;
  surface: RuntimeSurfaceSnapshot;
}): MessagingRemoteSurfaceCommandPreview {
  const queuedProjection = input.runtimeStatus.queuedProjections.find((projection) => projection.id === input.toolInput.queuedProjectionId);
  const event = queuedProjection
    ? input.runtimeStatus.recentEvents.find((candidate) => candidate.id === queuedProjection.sourceEventId)
    : undefined;
  const binding = queuedProjection?.bindingId
    ? input.bindings.bindings.find((candidate) => candidate.id === queuedProjection.bindingId)
    : undefined;
  const commandText = (input.toolInput.commandText ?? event?.text ?? "").trim();
  const parsed = parseRemoteSurfaceCommand(commandText, binding, input.surface);
  const blockers: string[] = [];

  if (!queuedProjection) blockers.push("Queued projection was not found in the messaging gateway runtime.");
  if (queuedProjection && queuedProjection.purpose !== "remote_ambient_surface") {
    blockers.push("Remote Ambient Surface commands are unavailable for Messaging Connector projections.");
  }
  if (!binding) {
    blockers.push("Queued projection does not map to an active Remote Ambient Surface binding.");
  } else {
    if (binding.purpose !== "remote_ambient_surface") blockers.push("Messaging binding is not a Remote Ambient Surface binding.");
    if (binding.status !== "active") blockers.push(`Messaging binding is not active: ${binding.status}.`);
    if (!binding.ownerUserId?.trim()) blockers.push("Remote Ambient Surface binding does not have an owner sender id.");
  }
  if (!event && !input.toolInput.commandText) {
    blockers.push("Original inbound command text is unavailable; pass commandText explicitly.");
  }
  if (!commandText) blockers.push("Remote Ambient Surface command text is empty.");
  if (parsed.blocker) blockers.push(parsed.blocker);

  const commandKind = blockers.length ? parsed.kind : parsed.kind;
  const wouldPersistBinding = blockers.length === 0 && (
    parsed.kind === "switch_surface" ||
    parsed.kind === "open_project" ||
    parsed.kind === "switch_project" ||
    parsed.kind === "create_project" ||
    parsed.kind === "open_workflow" ||
    parsed.kind === "open_chat" ||
    parsed.kind === "create_chat" ||
    parsed.kind === "create_workflow" ||
    parsed.kind === "workflow_action" ||
    parsed.kind === "update_setting"
  );
  const approvalRequired = blockers.length === 0 && (
    parsed.kind === "answer_workflow_question" ||
    parsed.kind === "workflow_action" ||
    parsed.kind === "switch_project" ||
    parsed.kind === "create_project" ||
    parsed.kind === "create_chat" ||
    parsed.kind === "create_workflow" ||
    parsed.kind === "update_setting"
  );
  return {
    status: blockers.length ? "blocked" : "ready",
    canApplyNow: blockers.length === 0,
    queuedProjectionId: input.toolInput.queuedProjectionId,
    commandText,
    commandKind,
    approvalRequired,
    wouldPersistBinding,
    wouldReadProviderMessages: false,
    wouldSendProviderMessages: false,
    blockers,
    policyNotes: [
      "Remote Ambient Surface commands execute only for queued projections that already passed owner/delegate authentication.",
      "This command layer does not read provider history, list provider chats, start provider bridges, or send provider messages.",
      "Messaging Connector projections are firewalled from Ambient runtime command execution.",
    "Low-risk navigation/status commands can apply without approval; runtime mutations such as project creation, chat creation, workflow creation, settings updates, and workflow answers are approval-gated.",
      "Workflow exploration and compile commands are approval-gated because they can spend model tokens, use tools/connectors, create artifacts, and update workflow state.",
      "Approval responses and permission grant revocations are owner-authenticated recovery actions and do not request a second approval prompt.",
    ],
    nextSteps: blockers.length
      ? ["Resolve the blockers, then preview the command again."]
      : nextStepsForCommand(parsed.kind),
    textPreview: previewText(commandText, 160),
    ...(queuedProjection ? { queuedProjection } : {}),
    ...(binding ? { binding } : {}),
    ...(event ? { event } : {}),
    ...(parsed.targetSurface ? { targetSurface: parsed.targetSurface } : {}),
    ...(parsed.targetProject ? { targetProject: parsed.targetProject } : {}),
    ...(parsed.targetProjectCreate ? { targetProjectCreate: parsed.targetProjectCreate } : {}),
    ...(parsed.targetChat ? { targetChat: parsed.targetChat } : {}),
    ...(parsed.newChatTitle ? { newChatTitle: parsed.newChatTitle } : {}),
    ...(parsed.targetWorkflow ? { targetWorkflow: parsed.targetWorkflow } : {}),
    ...(parsed.targetWorkflowCreate ? { targetWorkflowCreate: parsed.targetWorkflowCreate } : {}),
    ...(parsed.targetWorkflowAction ? { targetWorkflowAction: parsed.targetWorkflowAction } : {}),
    ...(parsed.targetQuestionId ? { targetQuestionId: parsed.targetQuestionId } : {}),
    ...(parsed.answerChoiceId ? { answerChoiceId: parsed.answerChoiceId } : {}),
    ...(parsed.answerFreeform ? { answerFreeform: parsed.answerFreeform } : {}),
    ...(parsed.targetApproval ? { targetApproval: parsed.targetApproval } : {}),
    ...(parsed.targetApprovalResponse ? { targetApprovalResponse: parsed.targetApprovalResponse } : {}),
    ...(parsed.targetPermissionGrant ? { targetPermissionGrant: parsed.targetPermissionGrant } : {}),
    ...(parsed.targetGrantRevoke ? { targetGrantRevoke: parsed.targetGrantRevoke } : {}),
    ...(parsed.targetSettingUpdate ? { targetSettingUpdate: parsed.targetSettingUpdate } : {}),
  };
}

export function messagingRemoteSurfaceCommandBindingUpdate(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceCommandBindingUpdate | undefined {
  if (!preview.canApplyNow || !preview.binding || !preview.targetSurface || !preview.wouldPersistBinding) return undefined;
  if (preview.commandKind === "create_chat") return undefined;
  if (preview.commandKind === "create_workflow") return undefined;
  if (preview.commandKind === "create_project") return undefined;
  if (preview.commandKind === "respond_approval") return undefined;
  if (preview.commandKind === "revoke_permission_grant") return undefined;
  return {
    bindingId: preview.binding.id,
    ambientSurface: preview.targetSurface,
    ...(preview.commandKind === "open_project" || preview.commandKind === "switch_project" ? { projectId: preview.targetProject?.path ?? null } : {}),
    workflowId: preview.commandKind === "open_workflow" || preview.commandKind === "workflow_action" ? preview.targetWorkflow?.id ?? null : null,
    chatThreadId: preview.commandKind === "open_chat" || preview.targetSurface === "chat" ? preview.targetChat?.id ?? null : null,
    reason: `remote-surface-command:${preview.commandKind}`,
  };
}

export function messagingRemoteSurfaceCommandProjectCreateRequest(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceProjectCreateRequest | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "create_project") return undefined;
  return preview.targetProjectCreate;
}

export function messagingRemoteSurfaceCommandChatCreateTitle(
  preview: MessagingRemoteSurfaceCommandPreview,
): string | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "create_chat") return undefined;
  return preview.newChatTitle?.trim() || undefined;
}

export function messagingRemoteSurfaceCommandWorkflowCreateRequest(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceWorkflowCreateRequest | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "create_workflow") return undefined;
  return preview.targetWorkflowCreate;
}

export function messagingRemoteSurfaceCommandWorkflowAnswerInput(
  preview: MessagingRemoteSurfaceCommandPreview,
): AnswerWorkflowDiscoveryQuestionInput | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "answer_workflow_question" || !preview.targetQuestionId) return undefined;
  return {
    questionId: preview.targetQuestionId,
    ...(preview.answerChoiceId ? { choiceId: preview.answerChoiceId } : {}),
    ...(preview.answerFreeform ? { freeform: preview.answerFreeform } : {}),
  };
}

export function messagingRemoteSurfaceCommandWorkflowActionRequest(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceWorkflowActionRequest | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "workflow_action") return undefined;
  return preview.targetWorkflowAction;
}

export function messagingRemoteSurfaceCommandApprovalResponse(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceApprovalResponseRequest | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "respond_approval") return undefined;
  return preview.targetApprovalResponse;
}

export function messagingRemoteSurfaceCommandGrantRevokeRequest(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfacePermissionGrantRevokeRequest | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "revoke_permission_grant") return undefined;
  return preview.targetGrantRevoke;
}

export function messagingRemoteSurfaceCommandSettingUpdateRequest(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceSettingUpdateRequest | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "update_setting") return undefined;
  return preview.targetSettingUpdate;
}

export function messagingRemoteSurfaceCommandResultProjection(input: {
  preview: MessagingRemoteSurfaceCommandPreview;
  bindings: MessagingBindingListResult;
  surface: RuntimeSurfaceSnapshot;
}): MessagingProjection | undefined {
  if (!input.preview.canApplyNow) return undefined;
  if (input.preview.commandKind === "help") return remoteSurfaceCommandHelpProjection(input.preview.binding);
  if (!input.preview.event) return undefined;
  return routeMessagingInboundEvent({
    event: input.preview.event,
    bindings: input.bindings,
    surface: input.surface,
  }).projection;
}

export function messagingRemoteSurfaceCommandBlockedResult(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceCommandResult {
  return {
    ...preview,
    applyStatus: "blocked",
    applied: false,
    approvalRecorded: false,
  };
}

export function messagingRemoteSurfaceCommandDeniedResult(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceCommandResult {
  return {
    ...preview,
    applyStatus: "denied",
    applied: false,
    approvalRecorded: false,
  };
}

export function messagingRemoteSurfaceCommandAppliedResult(input: {
  preview: MessagingRemoteSurfaceCommandPreview;
  approvalRecorded: boolean;
  updatedBinding?: MessagingBindingDescriptor;
  scheduledProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
  completedProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
  createdProject?: RuntimeSurfaceSnapshot["projects"][number];
  createdChat?: RuntimeSurfaceSnapshot["chats"][number];
  createdWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  answeredQuestion?: WorkflowDiscoveryQuestion;
  workflowActionResult?: MessagingRemoteSurfaceWorkflowActionResult;
  respondedApproval?: MessagingRemoteSurfaceApprovalResponseRequest;
  revokedPermissionGrant?: MessagingRemoteSurfacePermissionGrantRevokeRequest;
  updatedSetting?: MessagingRemoteSurfaceSettingUpdateResult;
  projection?: MessagingProjection;
}): MessagingRemoteSurfaceCommandResult {
  const applied = input.preview.wouldPersistBinding || Boolean(input.scheduledProjectSwitch) || Boolean(input.completedProjectSwitch) || Boolean(input.createdProject) || Boolean(input.createdChat) || Boolean(input.createdWorkflow) || Boolean(input.answeredQuestion) || input.workflowActionResult?.changed === true || Boolean(input.respondedApproval) || Boolean(input.revokedPermissionGrant) || input.updatedSetting?.changed === true;
  return {
    ...input.preview,
    applyStatus: applied ? "applied" : "noop",
    applied,
    approvalRecorded: input.approvalRecorded,
    ...(input.updatedBinding ? { updatedBinding: input.updatedBinding } : {}),
    ...(input.scheduledProjectSwitch ? { scheduledProjectSwitch: input.scheduledProjectSwitch } : {}),
    ...(input.completedProjectSwitch ? { completedProjectSwitch: input.completedProjectSwitch } : {}),
    ...(input.createdProject ? { createdProject: input.createdProject } : {}),
    ...(input.createdChat ? { createdChat: input.createdChat } : {}),
    ...(input.createdWorkflow ? { createdWorkflow: input.createdWorkflow } : {}),
    ...(input.answeredQuestion ? { answeredQuestion: input.answeredQuestion } : {}),
    ...(input.workflowActionResult ? { workflowActionResult: input.workflowActionResult } : {}),
    ...(input.respondedApproval ? { respondedApproval: input.respondedApproval } : {}),
    ...(input.revokedPermissionGrant ? { revokedPermissionGrant: input.revokedPermissionGrant } : {}),
    ...(input.updatedSetting ? { updatedSetting: input.updatedSetting } : {}),
    ...(input.projection ? { projection: input.projection } : {}),
  };
}

export function messagingRemoteSurfaceCommandPreviewText(preview: MessagingRemoteSurfaceCommandPreview): string {
  const lines = [
    "Remote Ambient Surface command preview",
    `Status: ${preview.status}`,
    `Command kind: ${preview.commandKind}`,
    `Command text: ${preview.textPreview}`,
    `Queued projection: ${preview.queuedProjectionId}`,
    preview.binding ? `Binding: ${preview.binding.id}` : undefined,
    preview.binding?.ambientSurface ? `Current surface: ${preview.binding.ambientSurface}` : undefined,
    preview.targetSurface ? `Target surface: ${preview.targetSurface}` : undefined,
    preview.targetProject ? `Target project: ${preview.targetProject.name} (${preview.targetProject.path})` : undefined,
    preview.targetProjectCreate ? `New project: ${projectCreateSummary(preview.targetProjectCreate)}` : undefined,
    preview.targetChat ? `Target chat: ${preview.targetChat.title} (${preview.targetChat.id})` : undefined,
    preview.newChatTitle ? `New chat title: ${preview.newChatTitle}` : undefined,
    preview.targetWorkflow ? `Target workflow: ${preview.targetWorkflow.title} (${preview.targetWorkflow.id})` : undefined,
    preview.targetWorkflowCreate ? `New workflow: ${workflowCreateSummary(preview.targetWorkflowCreate)}` : undefined,
    preview.targetWorkflowAction ? `Workflow action: ${workflowActionSummary(preview.targetWorkflowAction)}` : undefined,
    preview.targetQuestionId ? `Target question: ${preview.targetQuestionId}` : undefined,
    preview.answerChoiceId ? `Answer choice: ${preview.answerChoiceId}` : undefined,
    preview.answerFreeform ? `Answer freeform: ${preview.answerFreeform}` : undefined,
    preview.targetApproval ? `Target approval: ${preview.targetApproval.title} (${preview.targetApproval.id})` : undefined,
    preview.targetApprovalResponse ? `Approval response: ${preview.targetApprovalResponse.response}` : undefined,
    preview.targetPermissionGrant ? `Target permission grant: ${preview.targetPermissionGrant.targetLabel} (${preview.targetPermissionGrant.id})` : undefined,
    preview.targetGrantRevoke ? `Grant revoke: ${preview.targetGrantRevoke.targetLabel}` : undefined,
    preview.targetSettingUpdate ? `Setting update: ${settingUpdateSummary(preview.targetSettingUpdate)}` : undefined,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    `Would persist binding navigation: ${preview.wouldPersistBinding ? "yes" : "no"}`,
    `Would read provider messages: ${preview.wouldReadProviderMessages ? "yes" : "no"}`,
    `Would send provider messages: ${preview.wouldSendProviderMessages ? "yes" : "no"}`,
  ].filter((line): line is string => Boolean(line));
  if (preview.blockers.length) {
    lines.push("", "Blockers:");
    for (const blocker of preview.blockers) lines.push(`- ${blocker}`);
  }
  lines.push("", "Policy notes:");
  for (const note of preview.policyNotes) lines.push(`- ${note}`);
  lines.push("", "Next steps:");
  for (const step of preview.nextSteps) lines.push(`- ${step}`);
  return lines.join("\n");
}

export function messagingRemoteSurfaceCommandResultText(result: MessagingRemoteSurfaceCommandResult): string {
  const lines = [
    "Remote Ambient Surface command apply",
    `Apply status: ${result.applyStatus}`,
    `Applied: ${result.applied ? "yes" : "no"}`,
    `Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `Command kind: ${result.commandKind}`,
    `Command text: ${result.textPreview}`,
    `Queued projection: ${result.queuedProjectionId}`,
    result.updatedBinding ? `Updated binding: ${result.updatedBinding.id}` : undefined,
    result.updatedBinding?.ambientSurface ? `Binding surface: ${result.updatedBinding.ambientSurface}` : undefined,
    result.updatedBinding?.projectId ? `Binding project: ${result.updatedBinding.projectId}` : undefined,
    result.updatedBinding?.chatThreadId ? `Binding chat: ${result.updatedBinding.chatThreadId}` : undefined,
    result.updatedBinding?.workflowId ? `Binding workflow: ${result.updatedBinding.workflowId}` : undefined,
    result.scheduledProjectSwitch ? `Scheduled active project switch: ${result.scheduledProjectSwitch.name} (${result.scheduledProjectSwitch.path})` : undefined,
    result.completedProjectSwitch ? `Completed active project switch: ${result.completedProjectSwitch.name} (${result.completedProjectSwitch.path})` : undefined,
    result.createdProject ? `Created project: ${result.createdProject.name} (${result.createdProject.path})` : undefined,
    result.createdChat ? `Created chat: ${result.createdChat.title} (${result.createdChat.id})` : undefined,
    result.createdWorkflow ? `Created workflow: ${result.createdWorkflow.title} (${result.createdWorkflow.id})` : undefined,
    result.answeredQuestion ? `Answered question: ${result.answeredQuestion.id}` : undefined,
    result.workflowActionResult ? `Workflow action result: ${workflowActionResultSummary(result.workflowActionResult)}` : undefined,
    result.respondedApproval ? `Responded to approval: ${result.respondedApproval.title} (${result.respondedApproval.response})` : undefined,
    result.revokedPermissionGrant ? `Revoked permission grant: ${result.revokedPermissionGrant.targetLabel} (${result.revokedPermissionGrant.grantId})` : undefined,
    result.updatedSetting ? `Updated setting: ${result.updatedSetting.settingKey}; changed=${result.updatedSetting.changed ? "yes" : "no"}` : undefined,
    result.projection ? `Projection: ${result.projection.title} (${result.projection.kind})` : undefined,
  ].filter((line): line is string => Boolean(line));
  if (result.blockers.length) {
    lines.push("", "Blockers:");
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.projection) {
    lines.push("", messagingProjectionText(result.projection));
  }
  if (result.updatedSetting) {
    lines.push("", result.updatedSetting.text);
  }
  if (result.workflowActionResult) {
    lines.push("", result.workflowActionResult.text);
  }
  return lines.join("\n");
}

export function messagingRemoteSurfaceCommandApprovalDetail(preview: MessagingRemoteSurfaceCommandPreview): string {
  return [
    "Remote Ambient Surface command approval",
    `Command kind: ${preview.commandKind}`,
    `Command text: ${preview.textPreview}`,
    preview.binding ? `Binding: ${preview.binding.id}` : undefined,
    preview.targetSurface ? `Target surface: ${preview.targetSurface}` : undefined,
    preview.targetProject ? `Target project: ${preview.targetProject.name} (${preview.targetProject.path})` : undefined,
    preview.targetProjectCreate ? `New project: ${projectCreateSummary(preview.targetProjectCreate)}` : undefined,
    preview.targetChat ? `Target chat: ${preview.targetChat.title} (${preview.targetChat.id})` : undefined,
    preview.newChatTitle ? `New chat title: ${preview.newChatTitle}` : undefined,
    preview.targetWorkflow ? `Target workflow: ${preview.targetWorkflow.title} (${preview.targetWorkflow.id})` : undefined,
    preview.targetWorkflowCreate ? `New workflow: ${workflowCreateSummary(preview.targetWorkflowCreate)}` : undefined,
    preview.targetWorkflowAction ? `Workflow action: ${workflowActionSummary(preview.targetWorkflowAction)}` : undefined,
    preview.targetQuestionId ? `Target question: ${preview.targetQuestionId}` : undefined,
    preview.answerChoiceId ? `Answer choice: ${preview.answerChoiceId}` : undefined,
    preview.answerFreeform ? `Answer freeform: ${preview.answerFreeform}` : undefined,
    preview.targetApproval ? `Target approval: ${preview.targetApproval.title} (${preview.targetApproval.id})` : undefined,
    preview.targetApprovalResponse ? `Approval response: ${preview.targetApprovalResponse.response}` : undefined,
    preview.targetPermissionGrant ? `Target permission grant: ${preview.targetPermissionGrant.targetLabel} (${preview.targetPermissionGrant.id})` : undefined,
    preview.targetGrantRevoke ? `Grant revoke: ${preview.targetGrantRevoke.targetLabel}` : undefined,
    preview.targetSettingUpdate ? `Setting update: ${settingUpdateSummary(preview.targetSettingUpdate)}` : undefined,
    preview.commandKind === "answer_workflow_question"
      ? "This approval records a workflow discovery answer in Ambient runtime state. It does not read provider history or send provider messages."
      : preview.commandKind === "switch_project"
        ? "This approval schedules an active Ambient project switch after the current Pi turn finishes. It interrupts no provider bridge, reads no provider history, and sends no provider messages."
      : preview.commandKind === "create_project"
        ? "This approval creates and registers a new Ambient project workspace without switching the active Desktop runtime. It does not read provider history or send provider messages."
        : preview.commandKind === "create_chat"
          ? "This approval creates a new Ambient chat thread and binds this Remote Ambient Surface conversation to it. It does not read provider history or send provider messages."
          : preview.commandKind === "create_workflow"
          ? "This approval creates a new Ambient Workflow Agent thread in the active project and binds this Remote Ambient Surface conversation to it. It does not read provider history or send provider messages."
          : preview.commandKind === "workflow_action"
            ? "This approval runs a Workflow Agent runtime action. It may spend model tokens, call approved tools/connectors, create artifacts, and update workflow state. It does not read provider history or send provider messages."
          : preview.commandKind === "respond_approval"
            ? "This command is the owner's response to an existing Ambient permission prompt. It does not ask for a second approval prompt, read provider history, or send provider messages."
            : preview.commandKind === "revoke_permission_grant"
              ? "This command revokes an existing Ambient reusable permission grant as an owner-authenticated recovery action. It does not ask for a second approval prompt, read provider history, or send provider messages."
            : preview.commandKind === "update_setting"
              ? "This approval updates an Ambient runtime setting through a typed headless-safe settings API. It does not read provider history or send provider messages."
              : "This approval must be used only for future high-risk runtime mutations; the current navigation/status commands do not require approval.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function parseRemoteSurfaceCommand(
  commandText: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: MessagingRemoteSurfaceCommandKind;
  targetSurface?: MessagingAmbientSurface;
  targetProject?: RuntimeSurfaceSnapshot["projects"][number];
  targetProjectCreate?: MessagingRemoteSurfaceProjectCreateRequest;
  targetChat?: RuntimeSurfaceSnapshot["chats"][number];
  newChatTitle?: string;
  targetWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  targetWorkflowCreate?: MessagingRemoteSurfaceWorkflowCreateRequest;
  targetWorkflowAction?: MessagingRemoteSurfaceWorkflowActionRequest;
  targetQuestionId?: string;
  answerChoiceId?: string;
  answerFreeform?: string;
  targetApproval?: RuntimeSurfaceSnapshot["pendingApprovals"][number];
  targetApprovalResponse?: MessagingRemoteSurfaceApprovalResponseRequest;
  targetPermissionGrant?: RuntimeSurfaceSnapshot["permissionGrants"][number];
  targetGrantRevoke?: MessagingRemoteSurfacePermissionGrantRevokeRequest;
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
  blocker?: string;
} {
  const normalized = normalizeCommand(commandText);
  if (!normalized) return { kind: "unsupported" };
  if (["help", "/help", "commands", "what can i do"].includes(normalized)) return { kind: "help" };
  if (["status", "/status", "summary", "where are we", "what is open"].includes(normalized)) return { kind: "show_status" };

  const createProjectMatch = commandText.trim().match(/^(?:create|new|start)\s+(?:project|workspace)(?:\s+named|\s+called)?\s*[:\-]?\s+(.+)$/i);
  if (createProjectMatch) return createProjectCommand(createProjectMatch[1] ?? "");
  const switchProjectMatch = normalized.match(/^(?:switch|activate|use)\s+(?:active\s+)?(?:project|workspace)\s+(.+)$/);
  if (switchProjectMatch) return projectCommand(switchProjectMatch[1] ?? "", surface, "switch_project");
  const createChatMatch = commandText.trim().match(/^(?:create|new|start)\s+(?:chat|thread)(?:\s+named|\s+called)?\s*[:\-]?\s+(.+)$/i);
  if (createChatMatch) return createChatCommand(createChatMatch[1] ?? "");
  const createWorkflowMatch = commandText.trim().match(/^(?:create|new|start)\s+(?:workflow(?:\s+agent)?|agent)(?:\s+named|\s+called)?\s*[:\-]?\s+(.+)$/i);
  if (createWorkflowMatch) return createWorkflowCommand(createWorkflowMatch[1] ?? "");
  const openChatMatch = normalized.match(/^(?:open|show|select|summarize)\s+(?:chat|thread|conversation)\s+(.+)$/);
  if (openChatMatch) return chatCommand(openChatMatch[1] ?? "", surface);
  const numericChatOpen = normalized.match(/^open\s+(\d+)$/);
  if (numericChatOpen && binding?.ambientSurface === "chat") return chatCommand(numericChatOpen[1] ?? "", surface);
  const switchSurface = normalized.match(/^(?:switch(?:\s+to)?|show|list|open)\s+(?:surface\s+)?(.+)$/);
  if (switchSurface) {
    const targetSurface = surfaceAlias(switchSurface[1] ?? "");
    if (targetSurface) return { kind: "switch_surface", targetSurface };
  }

  const directSurface = surfaceAlias(normalized);
  if (directSurface) return { kind: "switch_surface", targetSurface: directSurface };

  const projectMatch = normalized.match(/^(?:open|show|select|summarize)\s+(?:project|workspace)\s+(.+)$/);
  if (projectMatch) return projectCommand(projectMatch[1] ?? "", surface);
  const workflowMatch = normalized.match(/^(?:open|show|select|summarize)\s+(?:workflow|workflow agent|agent)\s+(.+)$/);
  if (workflowMatch) return workflowCommand(workflowMatch[1] ?? "", surface);
  const numericOpen = normalized.match(/^open\s+(\d+)$/);
  if (numericOpen && binding?.ambientSurface === "workflow_agents") return workflowCommand(numericOpen[1] ?? "", surface);
  const workflowAction = workflowActionCommand(normalized, binding, surface);
  if (workflowAction) return workflowAction;
  const approvalResponse = approvalResponseCommand(normalized, surface);
  if (approvalResponse) return approvalResponse;
  const grantRevoke = permissionGrantRevokeCommand(normalized, surface);
  if (grantRevoke) return grantRevoke;
  const settingUpdate = settingUpdateCommand(commandText, normalized, binding, surface);
  if (settingUpdate) return settingUpdate;
  const answerMatch = commandText.trim().match(/^(?:answer|reply|respond)(?:\s+(?:workflow|question|prompt))*\s*[:\-]?\s+(.+)$/i);
  if (answerMatch) return answerWorkflowQuestionCommand(answerMatch[1] ?? "", binding, surface);
  const selectedWorkflow = selectedWorkflowForAnswer(binding, surface);
  if (selectedWorkflow?.waitingQuestionId && !looksLikeReservedCommand(normalized)) {
    return answerWorkflowQuestionCommand(commandText, binding, surface);
  }

  return {
    kind: "unsupported",
    blocker: "Unsupported Remote Ambient Surface command. Supported commands: status, help, switch surface <chat|projects|workflow_agents|settings|notifications>, open project <number|path|name>, switch project <number|path|name>, create project <name>, open chat <number|id|title>, create chat <title>, open workflow <number|id|title>, create workflow <request>, run exploration, compile from exploration, approve workflow preview, reject workflow preview, cancel workflow, retry failed step, retry failed event <number>, resume checkpoint, skip failed item, answer <workflow answer>, approve/deny request <number|id>, revoke grant <number|id|label>, set chat mode <agent|planner>, set chat thinking <minimal|low|medium|high|xhigh>, set planner autoFinalize <on|off>, set planner finalization <automatic|manual>, set voice <mode|enabled|autoplay|longReply|maxChars> <value>, set speech <enabled|language|autoSend|silence|noSpeechGate|rmsThreshold|stopTtsOnSpeech|queueWhileAgentRuns> <value>, set generated media autoplay <value>, clear search preference, prefer/require search provider <alias>.",
  };
}

function approvalResponseCommand(
  normalized: string,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "respond_approval";
  targetSurface: "notifications";
  targetApproval?: RuntimeSurfaceSnapshot["pendingApprovals"][number];
  targetApprovalResponse?: MessagingRemoteSurfaceApprovalResponseRequest;
  blocker?: string;
} | undefined {
  const match = normalized.match(/^(approve|allow|deny|reject|decline)(?:\s+(?:permission|approval|request))?\s+([a-z0-9._:-]+)(?:\s+(.+))?$/);
  if (!match) return undefined;
  const verb = match[1] ?? "";
  const target = match[2] ?? "";
  const modeText = (match[3] ?? "").trim();
  const approval = resolveApprovalTarget(target, surface);
  if (!approval) {
    return {
      kind: "respond_approval",
      targetSurface: "notifications",
      blocker: `Approval target was not found in the current runtime snapshot: ${target}.`,
    };
  }
  const response = responseModeForApprovalCommand(verb, modeText);
  if (!response) {
    return {
      kind: "respond_approval",
      targetSurface: "notifications",
      targetApproval: approval,
      blocker: `Unsupported approval response: ${modeText}. Use once, always thread, always workflow, always project, always workspace, or deny.`,
    };
  }
  if (!approval.responseModes.includes(response)) {
    return {
      kind: "respond_approval",
      targetSurface: "notifications",
      targetApproval: approval,
      blocker: `Approval response ${response} is not available for this request. Available responses: ${approval.responseModes.join(", ")}.`,
    };
  }
  return {
    kind: "respond_approval",
    targetSurface: "notifications",
    targetApproval: approval,
    targetApprovalResponse: {
      requestId: approval.id,
      title: approval.title,
      response,
      reason: `remote surface command ${verb} approval`,
    },
  };
}

function resolveApprovalTarget(
  target: string,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["pendingApprovals"][number] | undefined {
  const index = Number.parseInt(target, 10);
  if (Number.isFinite(index) && String(index) === target) return surface.pendingApprovals[index - 1];
  const normalized = normalizeCommand(target);
  return surface.pendingApprovals.find((approval) => normalizeCommand(approval.id) === normalized)
    ?? surface.pendingApprovals.find((approval) => normalizeCommand(approval.title) === normalized)
    ?? surface.pendingApprovals.find((approval) => normalizeCommand(approval.title).includes(normalized));
}

function responseModeForApprovalCommand(
  verb: string,
  modeText: string,
): RuntimeSurfaceApprovalResponseMode | undefined {
  if (["deny", "reject", "decline"].includes(verb)) return "deny";
  const normalized = normalizeCommand(modeText).replace(/[-_]/g, " ");
  if (!normalized || normalized === "once" || normalized === "allow once") return "allow_once";
  if (normalized === "always thread" || normalized === "thread" || normalized === "for thread") return "always_thread";
  if (normalized === "always workflow" || normalized === "workflow" || normalized === "for workflow") return "always_workflow";
  if (normalized === "always project" || normalized === "project" || normalized === "for project") return "always_project";
  if (normalized === "always workspace" || normalized === "workspace" || normalized === "for workspace") return "always_workspace";
  if (normalized === "deny") return "deny";
  return undefined;
}

function permissionGrantRevokeCommand(
  normalized: string,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "revoke_permission_grant";
  targetSurface: "notifications";
  targetPermissionGrant?: RuntimeSurfaceSnapshot["permissionGrants"][number];
  targetGrantRevoke?: MessagingRemoteSurfacePermissionGrantRevokeRequest;
  blocker?: string;
} | undefined {
  const match = normalized.match(/^(?:revoke|remove|delete|clear)(?:\s+(?:permission|persistent|active))?\s+grant\s+(.+)$/)
    ?? normalized.match(/^(?:revoke|remove|delete|clear)\s+permission\s+(.+)$/);
  if (!match) return undefined;
  const target = match[1] ?? "";
  const grant = resolvePermissionGrantTarget(target, surface);
  if (!grant) {
    return {
      kind: "revoke_permission_grant",
      targetSurface: "notifications",
      blocker: `Permission grant target was not found in the current runtime snapshot: ${target}.`,
    };
  }
  return {
    kind: "revoke_permission_grant",
    targetSurface: "notifications",
    targetPermissionGrant: grant,
    targetGrantRevoke: {
      grantId: grant.id,
      targetLabel: grant.targetLabel,
      reason: "remote surface command revoked permission grant",
    },
  };
}

function resolvePermissionGrantTarget(
  target: string,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["permissionGrants"][number] | undefined {
  const index = Number.parseInt(target, 10);
  if (Number.isFinite(index) && String(index) === target) return surface.permissionGrants[index - 1];
  const normalized = normalizeCommand(target);
  return surface.permissionGrants.find((grant) => normalizeCommand(grant.id) === normalized)
    ?? surface.permissionGrants.find((grant) => normalizeCommand(grant.targetLabel) === normalized)
    ?? surface.permissionGrants.find((grant) => normalizeCommand(grant.targetLabel).includes(normalized));
}

function settingUpdateCommand(
  commandText: string,
  normalized: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "update_setting";
  targetSurface: MessagingAmbientSurface;
  targetChat?: RuntimeSurfaceSnapshot["chats"][number];
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
  blocker?: string;
} | undefined {
  if (["enable voice", "turn on voice", "voice on"].includes(normalized)) {
    return voicePolicyCommand("enabled", true, "enable voice");
  }
  if (["disable voice", "turn off voice", "voice off"].includes(normalized)) {
    return voicePolicyCommand("enabled", false, "disable voice");
  }

  const voiceMode = normalized.match(/^set\s+(?:setting\s+)?voice\s+mode\s+(.+)$/);
  if (voiceMode) {
    const mode = voiceMode[1]?.trim();
    if (!["off", "assistant-final", "always", "tagged"].includes(mode ?? "")) {
      return settingBlocker(`Unsupported voice mode: ${voiceMode[1]}. Use off, assistant-final, always, or tagged.`);
    }
    return voicePolicyCommand("mode", mode!, "set voice mode");
  }

  const voiceBoolean = normalized.match(/^set\s+(?:setting\s+)?voice\s+(enabled|autoplay)\s+(.+)$/);
  if (voiceBoolean) {
    const value = parseBooleanSettingValue(voiceBoolean[2] ?? "");
    if (value === undefined) return settingBlocker(`Unsupported boolean value: ${voiceBoolean[2]}. Use on/off, true/false, or yes/no.`);
    return voicePolicyCommand(voiceBoolean[1]!, value, `set voice ${voiceBoolean[1]}`);
  }

  const voiceLongReply = normalized.match(/^set\s+(?:setting\s+)?voice\s+(?:long[-\s]?reply|longreply)\s+(.+)$/);
  if (voiceLongReply) {
    const value = voiceLongReply[1]?.trim();
    if (!["summarize", "skip", "ask"].includes(value ?? "")) {
      return settingBlocker(`Unsupported voice long-reply behavior: ${voiceLongReply[1]}. Use summarize, skip, or ask.`);
    }
    return voicePolicyCommand("longReply", value!, "set voice longReply");
  }

  const voiceMaxChars = normalized.match(/^set\s+(?:setting\s+)?voice\s+(?:max\s+chars|maxchars|max\s+characters)\s+(\d+)$/);
  if (voiceMaxChars) {
    const value = Number.parseInt(voiceMaxChars[1] ?? "", 10);
    if (!Number.isFinite(value) || value < 100 || value > 20_000) {
      return settingBlocker("Voice maxChars must be between 100 and 20000.");
    }
    return voicePolicyCommand("maxChars", value, "set voice maxChars");
  }

  const threadSettings = threadSettingsCommand(normalized, binding, surface);
  if (threadSettings) return threadSettings;

  const plannerFinalization = plannerFinalizationCommand(normalized);
  if (plannerFinalization) return plannerFinalization;

  const speechPolicy = speechPolicyCommand(commandText, normalized);
  if (speechPolicy) return speechPolicy;

  const mediaPlayback = mediaPlaybackCommand(normalized);
  if (mediaPlayback) return mediaPlayback;

  const clearSearch = normalized.match(/^(?:clear|reset)\s+(?:web\s+)?search(?:\s+preference|\s+routing)?$/);
  if (clearSearch) {
    return {
      kind: "update_setting",
      targetSurface: "settings",
      targetSettingUpdate: {
        settingKey: "search",
        operation: "search_preference",
        clear: true,
        reason: "remote surface command cleared search preference",
      },
    };
  }

  const searchProvider = normalized.match(/^(prefer|require|set)\s+(?:web\s+)?search(?:\s+provider|\s+preference)?\s+(.+)$/);
  if (searchProvider) {
    const verb = searchProvider[1] ?? "set";
    const providerAlias = (searchProvider[2] ?? "").trim();
    if (!providerAlias) return settingBlocker("Search provider alias is empty.");
    const mode = verb === "require" ? "require" : "prefer";
    return {
      kind: "update_setting",
      targetSurface: "settings",
      targetSettingUpdate: {
        settingKey: "search",
        operation: "search_preference",
        providerAlias,
        mode,
        fallback: mode === "require" ? "block" : "allow",
        reason: `remote surface command ${mode} search provider`,
      },
    };
  }

  return undefined;
}

function voicePolicyCommand(
  field: string,
  value: string | number | boolean,
  reason: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate: MessagingRemoteSurfaceSettingUpdateRequest;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    targetSettingUpdate: {
      settingKey: "voice",
      operation: "voice_policy",
      field,
      value,
      reason: `remote surface command ${reason}`,
    },
  };
}

function plannerFinalizationCommand(
  normalized: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
  blocker?: string;
} | undefined {
  if (["enable planner autofinalize", "enable planner auto finalize", "turn on planner autofinalize", "turn on planner auto finalize", "planner autofinalize on", "planner auto finalize on"].includes(normalized)) {
    return plannerFinalizationUpdateCommand(true, "enable planner autoFinalize");
  }
  if (["disable planner autofinalize", "disable planner auto finalize", "turn off planner autofinalize", "turn off planner auto finalize", "planner autofinalize off", "planner auto finalize off"].includes(normalized)) {
    return plannerFinalizationUpdateCommand(false, "disable planner autoFinalize");
  }

  const booleanMatch = normalized.match(/^set\s+(?:setting\s+)?planner\s+(?:auto[-\s]?finalize|auto[-\s]?finalization|autofinalize|finalization\s+auto)\s+(.+)$/);
  if (booleanMatch) {
    const value = parseBooleanSettingValue(booleanMatch[1] ?? "");
    if (value === undefined) return settingBlocker(`Unsupported planner autoFinalize value: ${booleanMatch[1]}. Use on/off, true/false, automatic, or manual.`);
    return plannerFinalizationUpdateCommand(value, "set planner autoFinalize");
  }

  const modeMatch = normalized.match(/^set\s+(?:setting\s+)?planner\s+finalization(?:\s+mode)?\s+(.+)$/);
  if (modeMatch) {
    const mode = normalizeCommand(modeMatch[1] ?? "").replace(/[-_]/g, " ");
    if (["automatic", "auto", "auto finalize", "autofinalize", "on"].includes(mode)) {
      return plannerFinalizationUpdateCommand(true, "set planner finalization automatic");
    }
    if (["manual", "off"].includes(mode)) {
      return plannerFinalizationUpdateCommand(false, "set planner finalization manual");
    }
    return settingBlocker(`Unsupported planner finalization mode: ${modeMatch[1]}. Use automatic or manual.`);
  }

  return undefined;
}

function plannerFinalizationUpdateCommand(
  autoFinalize: boolean,
  reason: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate: MessagingRemoteSurfaceSettingUpdateRequest;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    targetSettingUpdate: {
      settingKey: "planner",
      operation: "planner_finalization",
      field: "autoFinalize",
      value: autoFinalize,
      reason: `remote surface command ${reason}`,
    },
  };
}

function threadSettingsCommand(
  normalized: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "update_setting";
  targetSurface: "chat";
  targetChat?: RuntimeSurfaceSnapshot["chats"][number];
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
  blocker?: string;
} | undefined {
  const mode = normalized.match(/^set\s+(?:selected\s+)?(?:chat|thread)\s+(?:mode|collaboration\s+mode)\s+(.+)$/);
  if (mode) {
    const value = normalizeCommand(mode[1] ?? "");
    if (!isCollaborationMode(value)) return settingBlockerForChat(`Unsupported chat mode: ${mode[1]}. Use agent or planner.`);
    return threadSettingsUpdateCommand("collaborationMode", value, "set chat mode", binding, surface);
  }

  const thinking = normalized.match(/^set\s+(?:selected\s+)?(?:chat|thread)\s+(?:thinking|thinking\s+level|reasoning|reasoning\s+level)\s+(.+)$/);
  if (thinking) {
    const value = normalizeCommand(thinking[1] ?? "");
    if (!isThinkingLevel(value)) return settingBlockerForChat(`Unsupported chat thinking level: ${thinking[1]}. Use minimal, low, medium, high, or xhigh.`);
    return threadSettingsUpdateCommand("thinkingLevel", value, "set chat thinking", binding, surface);
  }

  return undefined;
}

function threadSettingsUpdateCommand(
  field: "collaborationMode" | "thinkingLevel",
  value: CollaborationMode | ThinkingLevel,
  reason: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "update_setting";
  targetSurface: "chat";
  targetChat?: RuntimeSurfaceSnapshot["chats"][number];
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
  blocker?: string;
} {
  const targetChat = selectedChatForThreadSettings(binding, surface);
  if (!targetChat) {
    return settingBlockerForChat("No target chat thread is selected. Open a chat first or bind this Remote Ambient Surface conversation to a chat.");
  }
  return {
    kind: "update_setting",
    targetSurface: "chat",
    targetChat,
    targetSettingUpdate: {
      settingKey: "thread",
      operation: "thread_settings",
      threadId: targetChat.id,
      threadTitle: targetChat.title,
      field,
      value,
      reason: `remote surface command ${reason}`,
    },
  };
}

function selectedChatForThreadSettings(
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["chats"][number] | undefined {
  if (binding?.chatThreadId) {
    const selected = surface.chats.find((chat) => chat.id === binding.chatThreadId);
    if (selected) return selected;
  }
  if (surface.activeChatId) {
    const active = surface.chats.find((chat) => chat.id === surface.activeChatId);
    if (active) return active;
  }
  if (surface.chats.length === 1) return surface.chats[0];
  return undefined;
}

function isCollaborationMode(value: string): value is CollaborationMode {
  return value === "agent" || value === "planner";
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function settingBlockerForChat(blocker: string): {
  kind: "update_setting";
  targetSurface: "chat";
  blocker: string;
} {
  return {
    kind: "update_setting",
    targetSurface: "chat",
    blocker,
  };
}

function speechPolicyCommand(
  commandText: string,
  normalized: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
  blocker?: string;
} | undefined {
  if (["enable speech", "enable speech input", "turn on speech", "turn on speech input", "speech on", "speech input on", "enable stt", "stt on"].includes(normalized)) {
    return sttPolicyCommand("enabled", true, "enable speech input");
  }
  if (["disable speech", "disable speech input", "turn off speech", "turn off speech input", "speech off", "speech input off", "disable stt", "stt off"].includes(normalized)) {
    return sttPolicyCommand("enabled", false, "disable speech input");
  }

  const prefix = "(?:speech|speech input|stt)";
  const speechBoolean = normalized.match(new RegExp(`^set\\s+(?:setting\\s+)?${prefix}\\s+(enabled|auto[-\\s]?send|autosend|auto[-\\s]?send[-\\s]?after[-\\s]?transcription|no[-\\s]?speech[-\\s]?gate|stop[-\\s]?tts[-\\s]?on[-\\s]?speech|queue[-\\s]?while[-\\s]?agent[-\\s]?runs)\\s+(.+)$`));
  if (speechBoolean) {
    const value = parseBooleanSettingValue(speechBoolean[2] ?? "");
    if (value === undefined) return settingBlocker(`Unsupported boolean value: ${speechBoolean[2]}. Use on/off, true/false, or yes/no.`);
    const field = normalizeSpeechField(speechBoolean[1] ?? "");
    if (!field) return settingBlocker(`Unsupported speech policy field: ${speechBoolean[1]}.`);
    return sttPolicyCommand(field, value, `set speech ${field}`);
  }

  const language = commandText.trim().match(/^(?:set\s+)?(?:speech|speech input|stt)\s+(?:language|spoken\s+language)\s+(.+)$/i);
  if (language) {
    const value = language[1]?.trim().replace(/\s+/g, " ");
    if (!value) return settingBlocker("Speech language is empty.");
    if (value.length > 80) return settingBlocker("Speech language is too long. Use 80 characters or fewer.");
    return sttPolicyCommand("spokenLanguage", value, "set speech language");
  }

  const silence = normalized.match(new RegExp(`^set\\s+(?:setting\\s+)?${prefix}\\s+(?:silence|silence\\s+finalize|silence\\s+finalize\\s+seconds|silence\\s+before\\s+transcribe)\\s+([0-9]+(?:\\.[0-9]+)?)$`));
  if (silence) {
    const value = Number.parseFloat(silence[1] ?? "");
    if (!Number.isFinite(value) || value < 0.3 || value > 2.5) return settingBlocker("Speech silenceFinalizeSeconds must be between 0.3 and 2.5.");
    return sttPolicyCommand("silenceFinalizeSeconds", value, "set speech silenceFinalizeSeconds");
  }

  const rms = normalized.match(new RegExp(`^set\\s+(?:setting\\s+)?${prefix}\\s+(?:rms|rms\\s+threshold|no[-\\s]?speech[-\\s]?gate\\s+rms|no[-\\s]?speech[-\\s]?threshold)\\s+(-?[0-9]+)$`));
  if (rms) {
    const value = Number.parseInt(rms[1] ?? "", 10);
    if (!Number.isFinite(value) || value < -90 || value > -20) return settingBlocker("Speech RMS threshold must be between -90 and -20 dBFS.");
    return sttPolicyCommand("noSpeechGateRmsThresholdDbfs", value, "set speech noSpeechGateRmsThresholdDbfs");
  }

  return undefined;
}

function normalizeSpeechField(field: string): string | undefined {
  const normalized = normalizeCommand(field).replace(/[-_]/g, " ");
  if (normalized === "enabled") return "enabled";
  if (["auto send", "autosend", "auto send after transcription"].includes(normalized)) return "autoSendAfterTranscription";
  if (normalized === "no speech gate") return "noSpeechGateEnabled";
  if (normalized === "stop tts on speech") return "stopTtsOnSpeech";
  if (normalized === "queue while agent runs") return "queueWhileAgentRuns";
  return undefined;
}

function sttPolicyCommand(
  field: string,
  value: string | number | boolean,
  reason: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate: MessagingRemoteSurfaceSettingUpdateRequest;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    targetSettingUpdate: {
      settingKey: "stt",
      operation: "stt_policy",
      field,
      value,
      reason: `remote surface command ${reason}`,
    },
  };
}

function mediaPlaybackCommand(
  normalized: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
  blocker?: string;
} | undefined {
  if (["enable generated media autoplay", "turn on generated media autoplay", "generated media autoplay on", "media autoplay on"].includes(normalized)) {
    return mediaPlaybackUpdateCommand(true, "enable generated media autoplay");
  }
  if (["disable generated media autoplay", "turn off generated media autoplay", "generated media autoplay off", "media autoplay off"].includes(normalized)) {
    return mediaPlaybackUpdateCommand(false, "disable generated media autoplay");
  }
  const mediaBoolean = normalized.match(/^set\s+(?:setting\s+)?(?:generated\s+media|media|media\s+browser)\s+(?:autoplay|auto[-\s]?play|generated\s+media\s+autoplay)\s+(.+)$/);
  if (mediaBoolean) {
    const value = parseBooleanSettingValue(mediaBoolean[1] ?? "");
    if (value === undefined) return settingBlocker(`Unsupported boolean value: ${mediaBoolean[1]}. Use on/off, true/false, or yes/no.`);
    return mediaPlaybackUpdateCommand(value, "set generated media autoplay");
  }
  return undefined;
}

function mediaPlaybackUpdateCommand(
  generatedMediaAutoplay: boolean,
  reason: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate: MessagingRemoteSurfaceSettingUpdateRequest;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    targetSettingUpdate: {
      settingKey: "media",
      operation: "media_playback",
      field: "generatedMediaAutoplay",
      value: generatedMediaAutoplay,
      reason: `remote surface command ${reason}`,
    },
  };
}

function settingBlocker(blocker: string): {
  kind: "update_setting";
  targetSurface: "settings";
  blocker: string;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    blocker,
  };
}

function createProjectCommand(
  rawRequest: string,
): {
  kind: "create_project";
  targetSurface: "projects";
  targetProjectCreate?: MessagingRemoteSurfaceProjectCreateRequest;
  blocker?: string;
} {
  const parsed = parseProjectCreateRequest(rawRequest);
  if (!parsed.name && !parsed.workspacePath) {
    return {
      kind: "create_project",
      targetSurface: "projects",
      blocker: "New project request is empty. Use create project <name> or create project <name> at <path>.",
    };
  }
  if (parsed.name && parsed.name.length > 120) {
    return {
      kind: "create_project",
      targetSurface: "projects",
      blocker: "New project name is too long. Use 120 characters or fewer.",
    };
  }
  if (parsed.workspacePath && parsed.workspacePath.length > 1000) {
    return {
      kind: "create_project",
      targetSurface: "projects",
      blocker: "New project path is too long. Use 1000 characters or fewer.",
    };
  }
  return {
    kind: "create_project",
    targetSurface: "projects",
    targetProjectCreate: {
      ...(parsed.name ? { name: parsed.name } : {}),
      ...(parsed.workspacePath ? { workspacePath: parsed.workspacePath } : {}),
      reason: "remote surface command created project workspace",
    },
  };
}

function parseProjectCreateRequest(rawRequest: string): { name?: string; workspacePath?: string } {
  const request = rawRequest.trim().replace(/\s+/g, " ");
  if (!request) return {};
  const namedPath = request.match(/^(.+?)\s+(?:at|in)\s+(.+)$/i);
  if (namedPath) {
    return {
      name: namedPath[1]?.trim().replace(/\s+/g, " "),
      workspacePath: namedPath[2]?.trim(),
    };
  }
  if (looksLikePath(request)) return { workspacePath: request };
  return { name: request };
}

function projectCommand(
  rawTarget: string,
  surface: RuntimeSurfaceSnapshot,
  kind: "open_project" | "switch_project" = "open_project",
): {
  kind: "open_project" | "switch_project";
  targetSurface: "projects";
  targetProject?: RuntimeSurfaceSnapshot["projects"][number];
  blocker?: string;
} {
  const target = rawTarget.trim();
  const index = Number.parseInt(target, 10);
  const byIndex = Number.isFinite(index) && String(index) === target
    ? surface.projects[index - 1]
    : undefined;
  const normalizedTarget = normalizeCommand(target);
  const byId = surface.projects.find((project) => normalizeCommand(project.id) === normalizedTarget || normalizeCommand(project.path) === normalizedTarget);
  const byName = surface.projects.find((project) => normalizeCommand(project.name) === normalizedTarget)
    ?? surface.projects.find((project) => normalizeCommand(project.name).includes(normalizedTarget));
  const targetProject = byIndex ?? byId ?? byName;
  if (!targetProject) {
    return {
      kind,
      targetSurface: "projects",
      blocker: `Project target was not found in the current runtime snapshot: ${rawTarget}.`,
    };
  }
  return {
    kind,
    targetSurface: "projects",
    targetProject,
  };
}

function createChatCommand(
  rawTitle: string,
): {
  kind: "create_chat";
  targetSurface: "chat";
  newChatTitle?: string;
  blocker?: string;
} {
  const title = rawTitle.trim().replace(/\s+/g, " ");
  if (!title) {
    return {
      kind: "create_chat",
      targetSurface: "chat",
      blocker: "New chat title is empty. Use create chat <title>.",
    };
  }
  if (title.length > 120) {
    return {
      kind: "create_chat",
      targetSurface: "chat",
      blocker: "New chat title is too long. Use 120 characters or fewer.",
    };
  }
  return {
    kind: "create_chat",
    targetSurface: "chat",
    newChatTitle: title,
  };
}

function createWorkflowCommand(
  rawRequest: string,
): {
  kind: "create_workflow";
  targetSurface: "workflow_agents";
  targetWorkflowCreate?: MessagingRemoteSurfaceWorkflowCreateRequest;
  blocker?: string;
} {
  const parsed = parseWorkflowCreateRequest(rawRequest);
  if (!parsed.initialRequest) {
    return {
      kind: "create_workflow",
      targetSurface: "workflow_agents",
      blocker: "New workflow request is empty. Use create workflow <request> or create workflow <title> :: <request>.",
    };
  }
  if (parsed.title && parsed.title.length > 120) {
    return {
      kind: "create_workflow",
      targetSurface: "workflow_agents",
      blocker: "New workflow title is too long. Use 120 characters or fewer before ::.",
    };
  }
  if (parsed.initialRequest.length > 4000) {
    return {
      kind: "create_workflow",
      targetSurface: "workflow_agents",
      blocker: "New workflow request is too long for a messaging command. Use 4000 characters or fewer.",
    };
  }
  return {
    kind: "create_workflow",
    targetSurface: "workflow_agents",
    targetWorkflowCreate: {
      ...(parsed.title ? { title: parsed.title } : {}),
      initialRequest: parsed.initialRequest,
      reason: "remote surface command created workflow",
    },
  };
}

function parseWorkflowCreateRequest(rawRequest: string): { title?: string; initialRequest: string } {
  const request = rawRequest.trim().replace(/\s+/g, " ");
  if (!request) return { initialRequest: "" };
  const explicitSplit = request.match(/^(.{1,120}?)\s+::\s+(.+)$/);
  if (explicitSplit) {
    return {
      title: explicitSplit[1]?.trim().replace(/\s+/g, " "),
      initialRequest: explicitSplit[2]?.trim().replace(/\s+/g, " ") ?? "",
    };
  }
  const titledRequest = request.match(/^([^:]{3,80}):\s+(.{10,})$/);
  if (titledRequest) {
    return {
      title: titledRequest[1]?.trim().replace(/\s+/g, " "),
      initialRequest: titledRequest[2]?.trim().replace(/\s+/g, " ") ?? "",
    };
  }
  return { initialRequest: request };
}

function chatCommand(
  rawTarget: string,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "open_chat";
  targetSurface: "chat";
  targetChat?: RuntimeSurfaceSnapshot["chats"][number];
  blocker?: string;
} {
  const target = rawTarget.trim();
  const index = Number.parseInt(target, 10);
  const byIndex = Number.isFinite(index) && String(index) === target
    ? surface.chats[index - 1]
    : undefined;
  const normalizedTarget = normalizeCommand(target);
  const byId = surface.chats.find((chat) => normalizeCommand(chat.id) === normalizedTarget);
  const byTitle = surface.chats.find((chat) => normalizeCommand(chat.title) === normalizedTarget)
    ?? surface.chats.find((chat) => normalizeCommand(chat.title).includes(normalizedTarget));
  const targetChat = byIndex ?? byId ?? byTitle;
  if (!targetChat) {
    return {
      kind: "open_chat",
      targetSurface: "chat",
      blocker: `Chat target was not found in the current runtime snapshot: ${rawTarget}.`,
    };
  }
  return {
    kind: "open_chat",
    targetSurface: "chat",
    targetChat,
  };
}

function answerWorkflowQuestionCommand(
  rawAnswer: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "answer_workflow_question";
  targetSurface: "workflow_agents";
  targetWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  targetQuestionId?: string;
  answerChoiceId?: string;
  answerFreeform?: string;
  blocker?: string;
} {
  const targetWorkflow = selectedWorkflowForAnswer(binding, surface);
  if (!targetWorkflow) {
    return {
      kind: "answer_workflow_question",
      targetSurface: "workflow_agents",
      blocker: "No selected workflow with a waiting discovery question was found. Open a workflow first, then answer its question.",
    };
  }
  if (!targetWorkflow.waitingQuestionId) {
    return {
      kind: "answer_workflow_question",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Workflow "${targetWorkflow.title}" does not have a waiting discovery question.`,
    };
  }
  const answer = resolveWorkflowAnswer(rawAnswer, targetWorkflow);
  if (answer.blocker) {
    return {
      kind: "answer_workflow_question",
      targetSurface: "workflow_agents",
      targetWorkflow,
      targetQuestionId: targetWorkflow.waitingQuestionId,
      blocker: answer.blocker,
    };
  }
  return {
    kind: "answer_workflow_question",
    targetSurface: "workflow_agents",
    targetWorkflow,
    targetQuestionId: targetWorkflow.waitingQuestionId,
    ...(answer.choiceId ? { answerChoiceId: answer.choiceId } : {}),
    ...(answer.freeform ? { answerFreeform: answer.freeform } : {}),
  };
}

function selectedWorkflowForAnswer(
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["workflowAgents"][number] | undefined {
  if (binding?.workflowId) {
    return surface.workflowAgents.find((workflow) => workflow.id === binding.workflowId);
  }
  const waiting = surface.workflowAgents.filter((workflow) => workflow.waitingQuestionId);
  return waiting.length === 1 ? waiting[0] : undefined;
}

function resolveWorkflowAnswer(
  rawAnswer: string,
  workflow: RuntimeSurfaceSnapshot["workflowAgents"][number],
): { choiceId?: string; freeform?: string; blocker?: string } {
  const answer = rawAnswer.trim();
  if (!answer) return { blocker: "Workflow discovery answer is empty." };
  const choices = workflow.waitingQuestionChoices ?? [];
  const normalizedAnswer = normalizeCommand(answer);
  const letterIndex = /^[a-z]$/i.test(answer) ? answer.toLowerCase().charCodeAt(0) - 97 : -1;
  const numericIndex = /^[0-9]+$/.test(answer) ? Number.parseInt(answer, 10) - 1 : -1;
  const choice = (
    (letterIndex >= 0 ? choices[letterIndex] : undefined) ??
    (numericIndex >= 0 ? choices[numericIndex] : undefined) ??
    choices.find((item) => normalizeCommand(item.id) === normalizedAnswer) ??
    choices.find((item) => normalizeCommand(item.label) === normalizedAnswer)
  );
  if (choice) return { choiceId: choice.id };
  if (workflow.waitingQuestionAllowFreeform) return { freeform: answer };
  return {
    blocker: choices.length
      ? `Answer did not match a valid choice for "${workflow.title}". Use A-${String.fromCharCode(64 + choices.length)}, a choice id, or an exact choice label.`
      : `Workflow "${workflow.title}" does not allow a freeform answer for this question.`,
  };
}

function workflowCommand(
  rawTarget: string,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "open_workflow";
  targetSurface: "workflow_agents";
  targetWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  blocker?: string;
} {
  const target = rawTarget.trim();
  const index = Number.parseInt(target, 10);
  const byIndex = Number.isFinite(index) && String(index) === target
    ? surface.workflowAgents[index - 1]
    : undefined;
  const normalizedTarget = normalizeCommand(target);
  const byId = surface.workflowAgents.find((workflow) => normalizeCommand(workflow.id) === normalizedTarget);
  const byTitle = surface.workflowAgents.find((workflow) => normalizeCommand(workflow.title) === normalizedTarget)
    ?? surface.workflowAgents.find((workflow) => normalizeCommand(workflow.title).includes(normalizedTarget));
  const targetWorkflow = byIndex ?? byId ?? byTitle;
  if (!targetWorkflow) {
    return {
      kind: "open_workflow",
      targetSurface: "workflow_agents",
      blocker: `Workflow target was not found in the current runtime snapshot: ${rawTarget}.`,
    };
  }
  return {
    kind: "open_workflow",
    targetSurface: "workflow_agents",
    targetWorkflow,
  };
}

function workflowActionCommand(
  normalized: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "workflow_action";
  targetSurface: "workflow_agents";
  targetWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  targetWorkflowAction?: MessagingRemoteSurfaceWorkflowActionRequest;
  blocker?: string;
} | undefined {
  const runExploration = normalized.match(/^(?:run|start)\s+(?:workflow\s+)?exploration(?:\s+(?:for|on)\s+(.+))?$/)
    ?? normalized.match(/^explore\s+(?:workflow\s+)?(.+)?$/);
  if (runExploration) {
    return workflowActionCommandForTarget("run_exploration", runExploration[1], binding, surface);
  }

  const compile = normalized.match(/^(?:compile|finalize)\s+(?:workflow|selected workflow|from exploration)(?:\s+(?:for|on)\s+(.+))?$/)
    ?? normalized.match(/^compile\s+from\s+exploration(?:\s+(?:for|on)\s+(.+))?$/)
    ?? normalized.match(/^compile\s+workflow\s+preview(?:\s+(?:for|on)\s+(.+))?$/);
  if (compile) {
    return workflowActionCommandForTarget("compile_preview", compile[1], binding, surface);
  }

  const approveArtifact = normalized.match(/^(?:approve|accept)\s+(?:workflow(?:\s+preview)?|workflow\s+artifact|artifact|preview)(?:\s+(?:for|on)\s+(.+))?$/);
  if (approveArtifact) {
    return workflowActionCommandForTarget("approve_artifact", approveArtifact[1], binding, surface);
  }

  const rejectArtifact = normalized.match(/^(?:reject|decline)\s+(?:workflow(?:\s+preview)?|workflow\s+artifact|artifact|preview)(?:\s+(?:for|on)\s+(.+))?$/);
  if (rejectArtifact) {
    return workflowActionCommandForTarget("reject_artifact", rejectArtifact[1], binding, surface);
  }

  const retryFailed = normalized.match(/^(?:retry|rerun)\s+(?:failed\s+)?(?:step|event)(?:\s+(\d+))?(?:\s+(?:for|on)\s+(.+))?$/)
    ?? normalized.match(/^(?:retry|rerun)\s+failed(?:\s+(\d+))?(?:\s+(?:for|on)\s+(.+))?$/);
  if (retryFailed) {
    return workflowRecoveryActionCommand("retry_failed_step", retryFailed[1], retryFailed[2], binding, surface);
  }

  const resumeCheckpoint = normalized.match(/^(?:resume|continue)(?:\s+from)?\s+checkpoint(?:\s+(\d+))?(?:\s+(?:for|on)\s+(.+))?$/);
  if (resumeCheckpoint) {
    return workflowRecoveryActionCommand("resume_checkpoint", resumeCheckpoint[1], resumeCheckpoint[2], binding, surface);
  }

  const skipFailed = normalized.match(/^skip\s+(?:failed\s+)?(?:item|event)(?:\s+(\d+))?(?:\s+(?:for|on)\s+(.+))?$/);
  if (skipFailed) {
    return workflowRecoveryActionCommand("skip_failed_item", skipFailed[1], skipFailed[2], binding, surface);
  }

  const cancelRun = normalized.match(/^(?:cancel|stop)\s+(?:workflow(?:\s+run)?|selected\s+workflow|run)(?:\s+(?:for|on)\s+(.+))?$/);
  if (cancelRun) {
    return workflowActionCommandForTarget("cancel_run", cancelRun[1], binding, surface);
  }

  return undefined;
}

function workflowRecoveryActionCommand(
  action: Extract<MessagingRemoteSurfaceWorkflowActionKind, "retry_failed_step" | "resume_checkpoint" | "skip_failed_item">,
  rawEventIndex: string | undefined,
  rawTarget: string | undefined,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "workflow_action";
  targetSurface: "workflow_agents";
  targetWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  targetWorkflowAction?: MessagingRemoteSurfaceWorkflowActionRequest;
  blocker?: string;
} {
  const targetWorkflow = rawTarget?.trim()
    ? resolveWorkflowTarget(rawTarget, surface)
    : selectedWorkflowForCommand(binding, surface);
  if (!targetWorkflow) {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      blocker: "No selected workflow was found. Open a failed workflow first, then retry failed step, resume checkpoint, or skip failed item.",
    };
  }
  if (targetWorkflow.waitingQuestionId) {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Workflow "${targetWorkflow.title}" has an unanswered discovery question. Answer it before recovery.`,
    };
  }
  const events = targetWorkflow.recoveryEvents ?? [];
  const eligibleEvents = events.filter((event) => recoveryEventEligible(event, action));
  if (!eligibleEvents.length) {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Workflow "${targetWorkflow.title}" has no failed event eligible for ${workflowActionLabel(action)}.`,
    };
  }
  const index = rawEventIndex ? Number.parseInt(rawEventIndex, 10) : undefined;
  if (index !== undefined && (!Number.isFinite(index) || String(index) !== rawEventIndex || index < 1)) {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Invalid failed event index: ${rawEventIndex}. Use a number from the workflow recovery event list.`,
    };
  }
  const event = index !== undefined ? events[index - 1] : eligibleEvents.length === 1 ? eligibleEvents[0] : undefined;
  if (!event) {
    const examples = eligibleEvents.flatMap((candidate) =>
      candidate.commandExamples?.length ? candidate.commandExamples : [`${workflowActionCommandExample(action)} ${events.indexOf(candidate) + 1}`],
    );
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Multiple failed events are eligible for ${workflowActionLabel(action)}. Use one of: ${examples.join("; ")}.`,
    };
  }
  if (!recoveryEventEligible(event, action)) {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Failed event ${index ?? event.id} is not eligible for ${workflowActionLabel(action)}.`,
    };
  }
  const label = workflowActionLabel(action);
  return {
    kind: "workflow_action",
    targetSurface: "workflow_agents",
    targetWorkflow,
    targetWorkflowAction: {
      action,
      workflowThreadId: targetWorkflow.id,
      workflowTitle: targetWorkflow.title,
      runId: event.runId,
      eventId: event.id,
      ...(event.graphNodeId ? { graphNodeId: event.graphNodeId } : {}),
      ...(event.itemKey ? { itemKey: event.itemKey } : {}),
      recoveryAction: workflowRecoveryActionFromRemoteAction(action),
      reason: `remote surface command ${label}`,
    },
  };
}

function workflowActionCommandForTarget(
  action: MessagingRemoteSurfaceWorkflowActionKind,
  rawTarget: string | undefined,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "workflow_action";
  targetSurface: "workflow_agents";
  targetWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
  targetWorkflowAction?: MessagingRemoteSurfaceWorkflowActionRequest;
  blocker?: string;
} {
  const targetWorkflow = rawTarget?.trim()
    ? resolveWorkflowTarget(rawTarget, surface)
    : selectedWorkflowForCommand(binding, surface);
  if (!targetWorkflow) {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      blocker: "No selected workflow was found. Open a workflow first, then run exploration or compile from exploration.",
    };
  }
  if (targetWorkflow.waitingQuestionId && action !== "cancel_run") {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Workflow "${targetWorkflow.title}" has an unanswered discovery question. Answer it before running exploration or compiling.`,
    };
  }
  if (action === "cancel_run") {
    const run = targetWorkflow.latestRun;
    if (!run || run.status !== "running") {
      return {
        kind: "workflow_action",
        targetSurface: "workflow_agents",
        targetWorkflow,
        blocker: `Workflow "${targetWorkflow.title}" does not have a running workflow run to cancel.`,
      };
    }
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      targetWorkflowAction: {
        action,
        workflowThreadId: targetWorkflow.id,
        workflowTitle: targetWorkflow.title,
        runId: run.id,
        reason: "remote surface command cancel workflow",
      },
    };
  }
  if (targetWorkflow.phase === "running" || targetWorkflow.latestRun?.status === "running") {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Workflow "${targetWorkflow.title}" is already running.`,
    };
  }
  if (targetWorkflow.phase === "compiling" && action === "compile_preview") {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      blocker: `Workflow "${targetWorkflow.title}" is already compiling.`,
    };
  }
  if (action === "approve_artifact" || action === "reject_artifact") {
    if (!targetWorkflow.activeArtifactId) {
      return {
        kind: "workflow_action",
        targetSurface: "workflow_agents",
        targetWorkflow,
        blocker: `Workflow "${targetWorkflow.title}" does not have an active workflow preview artifact to review.`,
      };
    }
    if (!workflowReadyForArtifactReview(targetWorkflow)) {
      return {
        kind: "workflow_action",
        targetSurface: "workflow_agents",
        targetWorkflow,
        blocker: `Workflow "${targetWorkflow.title}" is not ready for artifact review. Compile a workflow preview first.`,
      };
    }
    const label = action === "approve_artifact" ? "approve workflow preview" : "reject workflow preview";
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      targetWorkflow,
      targetWorkflowAction: {
        action,
        workflowThreadId: targetWorkflow.id,
        workflowTitle: targetWorkflow.title,
        artifactId: targetWorkflow.activeArtifactId,
        reason: `remote surface command ${label}`,
      },
    };
  }
  const label = action === "run_exploration" ? "run exploration" : "compile from exploration";
  return {
    kind: "workflow_action",
    targetSurface: "workflow_agents",
    targetWorkflow,
    targetWorkflowAction: {
      action,
      workflowThreadId: targetWorkflow.id,
      workflowTitle: targetWorkflow.title,
      reason: `remote surface command ${label}`,
    },
  };
}

function recoveryEventEligible(
  event: NonNullable<RuntimeSurfaceSnapshot["workflowAgents"][number]["recoveryEvents"]>[number],
  action: Extract<MessagingRemoteSurfaceWorkflowActionKind, "retry_failed_step" | "resume_checkpoint" | "skip_failed_item">,
): boolean {
  if (action === "retry_failed_step") return event.retryEligible;
  if (action === "resume_checkpoint") return event.resumeEligible;
  return event.skipEligible;
}

function workflowRecoveryActionFromRemoteAction(
  action: Extract<MessagingRemoteSurfaceWorkflowActionKind, "retry_failed_step" | "resume_checkpoint" | "skip_failed_item">,
): WorkflowRecoveryAction {
  if (action === "retry_failed_step") return "retry_step";
  if (action === "resume_checkpoint") return "resume_checkpoint";
  return "skip_item";
}

function workflowActionCommandExample(
  action: Extract<MessagingRemoteSurfaceWorkflowActionKind, "retry_failed_step" | "resume_checkpoint" | "skip_failed_item">,
): string {
  if (action === "retry_failed_step") return "retry failed event";
  if (action === "resume_checkpoint") return "resume checkpoint";
  return "skip failed item";
}

function workflowReadyForArtifactReview(workflow: RuntimeSurfaceSnapshot["workflowAgents"][number]): boolean {
  return workflow.phase === "ready_for_review" || workflow.latestVersion?.status === "ready_for_review" || workflow.latestRun?.status === "previewed";
}

function selectedWorkflowForCommand(
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["workflowAgents"][number] | undefined {
  if (binding?.workflowId) {
    return surface.workflowAgents.find((workflow) => workflow.id === binding.workflowId);
  }
  return surface.workflowAgents.length === 1 ? surface.workflowAgents[0] : undefined;
}

function resolveWorkflowTarget(
  rawTarget: string,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["workflowAgents"][number] | undefined {
  const target = rawTarget.trim();
  const index = Number.parseInt(target, 10);
  if (Number.isFinite(index) && String(index) === target) return surface.workflowAgents[index - 1];
  const normalizedTarget = normalizeCommand(target);
  return surface.workflowAgents.find((workflow) => normalizeCommand(workflow.id) === normalizedTarget)
    ?? surface.workflowAgents.find((workflow) => normalizeCommand(workflow.title) === normalizedTarget)
    ?? surface.workflowAgents.find((workflow) => normalizeCommand(workflow.title).includes(normalizedTarget));
}

function surfaceAlias(raw: string): MessagingAmbientSurface | undefined {
  const normalized = normalizeCommand(raw);
  if (["chat", "chats", "thread", "threads", "conversation", "conversations"].includes(normalized)) return "chat";
  if (["project", "projects", "board", "boards"].includes(normalized)) return "projects";
  if (["workflow", "workflows", "workflow agent", "workflow agents", "workflow_agents", "agents"].includes(normalized)) return "workflow_agents";
  if (["setting", "settings"].includes(normalized)) return "settings";
  if (["notification", "notifications", "status notifications", "notifications status", "notifications/status"].includes(normalized)) return "notifications";
  return undefined;
}

function remoteSurfaceCommandHelpProjection(binding?: MessagingBindingDescriptor): MessagingProjection {
  return {
    kind: "surface_list",
    purpose: "remote_ambient_surface",
    ...(binding?.id ? { bindingId: binding.id } : {}),
    surface: binding?.ambientSurface,
    title: "Remote Ambient Surface commands",
    summary: "Supported Remote Ambient Surface commands for the current messaging binding.",
    bodyLines: [
      "status - show the current bound Ambient surface.",
      "switch surface projects - list registered Ambient projects.",
      "open project 1 - bind this conversation to the first project in the current project list.",
      "switch project 1 - after approval, switch Ambient Desktop to the first project after the current Pi turn finishes.",
      "create project <name> - create and register a new Ambient project workspace after approval.",
      "create project <name> at <path> - create a project at an explicit workspace path after approval.",
      "switch surface chat - list recent chats.",
      "open chat 1 - bind this conversation to the first chat in the current chat list.",
      "create chat <title> - create a new Ambient chat thread after approval and bind this conversation to it.",
      "switch surface workflow_agents - list workflow agents.",
      "open workflow 1 - bind this conversation to the first workflow in the current workflow list.",
      "create workflow <request> - create a new Ambient Workflow Agent thread after approval and bind this conversation to it.",
      "create workflow <title> :: <request> - create a workflow with an explicit title and initial request.",
      "run exploration - run a bounded exploration pass for the selected workflow after approval.",
      "compile from exploration - compile the selected workflow into a reviewable preview after approval.",
      "approve workflow preview - approve the selected workflow preview artifact after approval.",
      "reject workflow preview - reject the selected workflow preview artifact after approval.",
      "cancel workflow - cancel the selected workflow's running run after approval.",
      "retry failed step - retry the selected workflow's only eligible failed event after approval.",
      "retry failed event 1 - retry a numbered failed event when multiple recovery events are shown.",
      "resume checkpoint - resume the selected workflow from retained checkpoints after approval.",
      "skip failed item - skip the selected workflow's only eligible failed item after approval.",
      "answer <text> - answer the selected workflow's waiting discovery question after approval.",
      "switch surface settings - show headless-readable settings.",
      "set voice mode off - update a headless-safe voice policy setting after approval.",
      "set voice autoplay on - update voice autoplay after approval.",
      "set planner autoFinalize off - update Planner Mode auto-finalization after approval.",
      "set planner finalization automatic - update Planner Mode auto-finalization after approval.",
      "set speech language English - update speech input language after approval.",
      "set speech autoSend off - update speech input auto-send behavior after approval.",
      "set speech silence 0.8 - update speech silence detection timing after approval.",
      "set generated media autoplay on - update generated media video preview autoplay after approval.",
      "clear search preference - reset web search routing after approval.",
      "prefer search provider brave - prefer an installed Ambient CLI search provider after approval.",
      "switch surface notifications - show pending approvals and notification/status projection.",
      "approve request 1 - approve the first pending Ambient permission prompt once.",
      "approve request 1 always thread - approve the first pending permission prompt and create a thread-scoped grant when available.",
      "deny request 1 - deny the first pending Ambient permission prompt.",
      "revoke grant 1 - revoke the first active reusable Ambient permission grant.",
      "Messaging Connector conversations cannot use these Ambient runtime commands.",
    ],
    actions: [
      { id: "status", label: "Status", command: "status" },
      { id: "projects", label: "Projects", command: "switch surface projects" },
      { id: "create-project", label: "Create project", command: "create project <name>", requiresApproval: true },
      { id: "workflows", label: "Workflow agents", command: "switch surface workflow_agents" },
      { id: "create-workflow", label: "Create workflow", command: "create workflow <request>", requiresApproval: true },
      { id: "run-exploration", label: "Run exploration", command: "run exploration", requiresApproval: true },
      { id: "compile-workflow", label: "Compile workflow", command: "compile from exploration", requiresApproval: true },
      { id: "settings", label: "Settings", command: "switch surface settings" },
      { id: "notifications", label: "Approvals", command: "switch surface notifications" },
      { id: "revoke-grant", label: "Revoke grant", command: "revoke grant 1" },
      { id: "planner-finalization", label: "Planner finalization", command: "set planner autoFinalize off", requiresApproval: true },
      { id: "speech-language", label: "Speech language", command: "set speech language English", requiresApproval: true },
      { id: "media-autoplay", label: "Media autoplay", command: "set generated media autoplay on", requiresApproval: true },
    ],
    disclosure: {
      includesRuntimeState: true,
      includesWorkspacePath: false,
      includesPrivateChatState: false,
      notes: ["Help is shown only after a queued Remote Ambient Surface projection passes owner/delegate authentication."],
    },
  };
}

function nextStepsForCommand(kind: MessagingRemoteSurfaceCommandKind): string[] {
  if (kind === "show_status") return ["Apply to render the current bound surface projection without mutating provider or binding state."];
  if (kind === "help") return ["Apply to render supported Remote Ambient Surface commands."];
  if (kind === "switch_surface") return ["Apply to persist the binding navigation target, then send the resulting projection through the approved reply path if needed."];
  if (kind === "open_project") return ["Apply to persist the selected project scope, then send the project projection through the approved reply path if needed."];
  if (kind === "switch_project") return ["Ask the user to approve switching the active Ambient project after this Pi turn finishes, then send confirmation through the approved reply path if needed."];
  if (kind === "create_project") return ["Ask the user to approve creating this Ambient project workspace, then send the refreshed project projection through the approved reply path if needed."];
  if (kind === "open_chat") return ["Apply to persist the selected chat scope, then send the chat status projection through the approved reply path if needed."];
  if (kind === "create_chat") return ["Ask the user to approve creating this Ambient chat thread, then send the refreshed chat projection through the approved reply path if needed."];
  if (kind === "open_workflow") return ["Apply to persist the selected workflow scope, then send the workflow status projection through the approved reply path if needed."];
  if (kind === "create_workflow") return ["Ask the user to approve creating this Ambient Workflow Agent thread, then send the refreshed workflow projection through the approved reply path if needed."];
  if (kind === "workflow_action") return ["Ask the user to approve this Workflow Agent runtime action, then send the refreshed workflow projection through the approved reply path if needed."];
  if (kind === "answer_workflow_question") return ["Ask the user to approve recording this workflow discovery answer, then send the refreshed workflow projection through the approved reply path if needed."];
  if (kind === "respond_approval") return ["Apply to resolve the selected pending permission prompt. This command is already the owner's approval decision and does not trigger a second approval prompt."];
  if (kind === "revoke_permission_grant") return ["Apply to revoke the selected reusable permission grant. This command is already an owner-authenticated recovery action and does not trigger a second approval prompt."];
  if (kind === "update_setting") return ["Ask the user to approve this settings update, then send the refreshed settings projection through the approved reply path if needed."];
  return ["Ask the owner to use a supported Remote Ambient Surface command."];
}

function looksLikeReservedCommand(normalized: string): boolean {
  return /^(?:switch|show|list|open|create|new|start|set|enable|disable|clear|reset|prefer|require|approve|allow|deny|reject|decline|revoke|remove|delete|help|commands|status|summary)\b/.test(normalized);
}

function normalizeCommand(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseBooleanSettingValue(value: string): boolean | undefined {
  const normalized = normalizeCommand(value);
  if (["on", "true", "yes", "enabled", "enable", "1"].includes(normalized)) return true;
  if (["automatic", "auto"].includes(normalized)) return true;
  if (["off", "false", "no", "disabled", "disable", "manual", "0"].includes(normalized)) return false;
  return undefined;
}

function settingUpdateSummary(update: MessagingRemoteSurfaceSettingUpdateRequest): string {
  if (update.operation === "voice_policy") return `voice.${update.field}=${String(update.value)}`;
  if (update.operation === "stt_policy") return `stt.${update.field}=${String(update.value)}`;
  if (update.operation === "media_playback") return `media.${update.field}=${String(update.value)}`;
  if (update.operation === "thread_settings") return `thread.${update.field}=${String(update.value)}${update.threadTitle ? ` (${update.threadTitle})` : ""}`;
  if (update.operation === "planner_finalization") return `planner.${update.field}=${String(update.value)}`;
  if (update.clear) return "search.preference=default";
  return `search.provider=${update.providerAlias ?? ""}; mode=${update.mode ?? "prefer"}; fallback=${update.fallback ?? "allow"}`;
}

function projectCreateSummary(request: MessagingRemoteSurfaceProjectCreateRequest): string {
  const name = request.name ? `name=${request.name}` : undefined;
  const path = request.workspacePath ? `path=${request.workspacePath}` : undefined;
  return [name, path].filter(Boolean).join("; ") || "default project path";
}

function workflowCreateSummary(request: MessagingRemoteSurfaceWorkflowCreateRequest): string {
  const title = request.title ? `${request.title}; ` : "";
  return `${title}request=${previewText(request.initialRequest, 120)}`;
}

function workflowActionSummary(request: MessagingRemoteSurfaceWorkflowActionRequest): string {
  const label = workflowActionLabel(request.action);
  const target = [
    request.artifactId ? `artifact=${request.artifactId}` : undefined,
    request.runId ? `run=${request.runId}` : undefined,
    request.eventId ? `event=${request.eventId}` : undefined,
    request.graphNodeId ? `node=${request.graphNodeId}` : undefined,
    request.itemKey ? `item=${request.itemKey}` : undefined,
    request.recoveryAction ? `recovery=${request.recoveryAction}` : undefined,
  ].filter(Boolean).join("; ");
  return `${label}; workflow=${request.workflowTitle} (${request.workflowThreadId})${target ? `; ${target}` : ""}`;
}

function workflowActionResultSummary(result: MessagingRemoteSurfaceWorkflowActionResult): string {
  const label = workflowActionResultLabel(result.action);
  const detail = [
    result.traceId ? `trace=${result.traceId}` : undefined,
    result.graphSnapshotId ? `graph=${result.graphSnapshotId}` : undefined,
    result.artifactId ? `artifact=${result.artifactId}` : undefined,
    result.artifactStatus ? `artifactStatus=${result.artifactStatus}` : undefined,
    result.runId ? `run=${result.runId}` : undefined,
    result.runStatus ? `runStatus=${result.runStatus}` : undefined,
  ].filter(Boolean).join("; ");
  return `${label}; changed=${result.changed ? "yes" : "no"}${detail ? `; ${detail}` : ""}`;
}

function workflowActionLabel(action: MessagingRemoteSurfaceWorkflowActionKind): string {
  if (action === "run_exploration") return "run exploration";
  if (action === "compile_preview") return "compile preview";
  if (action === "approve_artifact") return "approve workflow preview";
  if (action === "reject_artifact") return "reject workflow preview";
  if (action === "retry_failed_step") return "retry failed step";
  if (action === "resume_checkpoint") return "resume checkpoint";
  if (action === "skip_failed_item") return "skip failed item";
  return "cancel workflow";
}

function workflowActionResultLabel(action: MessagingRemoteSurfaceWorkflowActionKind): string {
  if (action === "run_exploration") return "exploration";
  if (action === "compile_preview") return "compile";
  if (action === "approve_artifact") return "artifact approved";
  if (action === "reject_artifact") return "artifact rejected";
  if (action === "retry_failed_step") return "recovery retry";
  if (action === "resume_checkpoint") return "recovery resume";
  if (action === "skip_failed_item") return "recovery skip item";
  return "canceled";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function previewText(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}...`;
}

function looksLikePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("~") || value.startsWith(".");
}
