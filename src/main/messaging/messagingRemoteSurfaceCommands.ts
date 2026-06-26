import type {
  MessagingAmbientSurface,
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  MessagingProjection,
  RuntimeSurfaceSnapshot,
} from "../../shared/messagingGateway";
import type { AnswerWorkflowDiscoveryQuestionInput, WorkflowDiscoveryQuestion } from "../../shared/workflowTypes";
import { routeMessagingInboundEvent } from "./messagingGatewayProjection";
import type {
  MessagingRemoteSurfaceApprovalResponseRequest,
  MessagingRemoteSurfaceCommandBindingUpdate,
  MessagingRemoteSurfaceCommandKind,
  MessagingRemoteSurfaceCommandPreview,
  MessagingRemoteSurfaceCommandResult,
  MessagingRemoteSurfaceCommandToolInput,
  MessagingRemoteSurfacePermissionGrantRevokeRequest,
  MessagingRemoteSurfaceProjectCreateRequest,
  MessagingRemoteSurfaceSettingUpdateRequest,
  MessagingRemoteSurfaceSettingUpdateResult,
  MessagingRemoteSurfaceWorkflowActionRequest,
  MessagingRemoteSurfaceWorkflowActionResult,
  MessagingRemoteSurfaceWorkflowCreateRequest,
} from "./messagingRemoteSurfaceCommandTypes";
import { nextStepsForCommand, previewText, remoteSurfaceCommandHelpProjection } from "./messagingRemoteSurfaceCommandText";
import { approvalResponseCommand, permissionGrantRevokeCommand } from "./messagingRemoteSurfaceCommandApprovals";
import {
  answerWorkflowQuestionCommand,
  chatCommand,
  createChatCommand,
  createProjectCommand,
  createWorkflowCommand,
  projectCommand,
  selectedWorkflowForAnswer,
  workflowActionCommand,
  workflowCommand,
} from "./messagingRemoteSurfaceCommandTargets";
import { normalizeCommand } from "./messagingRemoteSurfaceCommandParsing";
import { settingUpdateCommand } from "./messagingRemoteSurfaceCommandSettings";
export type {
  MessagingRemoteSurfaceApprovalResponseRequest,
  MessagingRemoteSurfaceCommandApplyStatus,
  MessagingRemoteSurfaceCommandBindingUpdate,
  MessagingRemoteSurfaceCommandKind,
  MessagingRemoteSurfaceCommandPreview,
  MessagingRemoteSurfaceCommandResult,
  MessagingRemoteSurfaceCommandStatus,
  MessagingRemoteSurfaceCommandToolInput,
  MessagingRemoteSurfacePermissionGrantRevokeRequest,
  MessagingRemoteSurfaceProjectCreateRequest,
  MessagingRemoteSurfaceSettingUpdateRequest,
  MessagingRemoteSurfaceSettingUpdateResult,
  MessagingRemoteSurfaceWorkflowActionKind,
  MessagingRemoteSurfaceWorkflowActionRequest,
  MessagingRemoteSurfaceWorkflowActionResult,
  MessagingRemoteSurfaceWorkflowCreateRequest,
} from "./messagingRemoteSurfaceCommandTypes";
export {
  messagingRemoteSurfaceCommandApprovalDetail,
  messagingRemoteSurfaceCommandPreviewText,
  messagingRemoteSurfaceCommandResultText,
} from "./messagingRemoteSurfaceCommandText";

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
  const wouldPersistBinding =
    blockers.length === 0 &&
    (parsed.kind === "switch_surface" ||
      parsed.kind === "open_project" ||
      parsed.kind === "switch_project" ||
      parsed.kind === "create_project" ||
      parsed.kind === "open_workflow" ||
      parsed.kind === "open_chat" ||
      parsed.kind === "create_chat" ||
      parsed.kind === "create_workflow" ||
      parsed.kind === "workflow_action" ||
      parsed.kind === "update_setting");
  const approvalRequired =
    blockers.length === 0 &&
    (parsed.kind === "answer_workflow_question" ||
      parsed.kind === "workflow_action" ||
      parsed.kind === "switch_project" ||
      parsed.kind === "create_project" ||
      parsed.kind === "create_chat" ||
      parsed.kind === "create_workflow" ||
      parsed.kind === "update_setting");
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
    nextSteps: blockers.length ? ["Resolve the blockers, then preview the command again."] : nextStepsForCommand(parsed.kind),
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
    ...(preview.commandKind === "open_project" || preview.commandKind === "switch_project"
      ? { projectId: preview.targetProject?.path ?? null }
      : {}),
    workflowId:
      preview.commandKind === "open_workflow" || preview.commandKind === "workflow_action" ? (preview.targetWorkflow?.id ?? null) : null,
    chatThreadId: preview.commandKind === "open_chat" || preview.targetSurface === "chat" ? (preview.targetChat?.id ?? null) : null,
    reason: `remote-surface-command:${preview.commandKind}`,
  };
}

export function messagingRemoteSurfaceCommandProjectCreateRequest(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceProjectCreateRequest | undefined {
  if (!preview.canApplyNow || preview.commandKind !== "create_project") return undefined;
  return preview.targetProjectCreate;
}

export function messagingRemoteSurfaceCommandChatCreateTitle(preview: MessagingRemoteSurfaceCommandPreview): string | undefined {
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
  const applied =
    input.preview.wouldPersistBinding ||
    Boolean(input.scheduledProjectSwitch) ||
    Boolean(input.completedProjectSwitch) ||
    Boolean(input.createdProject) ||
    Boolean(input.createdChat) ||
    Boolean(input.createdWorkflow) ||
    Boolean(input.answeredQuestion) ||
    input.workflowActionResult?.changed === true ||
    Boolean(input.respondedApproval) ||
    Boolean(input.revokedPermissionGrant) ||
    input.updatedSetting?.changed === true;
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

  const createProjectMatch = commandText
    .trim()
    .match(/^(?:create|new|start)\s+(?:project|workspace)(?:\s+named|\s+called)?\s*[:\-]?\s+(.+)$/i);
  if (createProjectMatch) return createProjectCommand(createProjectMatch[1] ?? "");
  const switchProjectMatch = normalized.match(/^(?:switch|activate|use)\s+(?:active\s+)?(?:project|workspace)\s+(.+)$/);
  if (switchProjectMatch) return projectCommand(switchProjectMatch[1] ?? "", surface, "switch_project");
  const createChatMatch = commandText.trim().match(/^(?:create|new|start)\s+(?:chat|thread)(?:\s+named|\s+called)?\s*[:\-]?\s+(.+)$/i);
  if (createChatMatch) return createChatCommand(createChatMatch[1] ?? "");
  const createWorkflowMatch = commandText
    .trim()
    .match(/^(?:create|new|start)\s+(?:workflow(?:\s+agent)?|agent)(?:\s+named|\s+called)?\s*[:\-]?\s+(.+)$/i);
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
    blocker:
      "Unsupported Remote Ambient Surface command. Supported commands: status, help, switch surface <chat|projects|workflow_agents|settings|notifications>, open project <number|path|name>, switch project <number|path|name>, create project <name>, open chat <number|id|title>, create chat <title>, open workflow <number|id|title>, create workflow <request>, run exploration, compile from exploration, approve workflow preview, reject workflow preview, cancel workflow, retry failed step, retry failed event <number>, resume checkpoint, skip failed item, answer <workflow answer>, approve/deny request <number|id>, revoke grant <number|id|label>, set chat mode <agent|planner>, set chat thinking <minimal|low|medium|high|xhigh>, set planner autoFinalize <on|off>, set planner finalization <automatic|manual>, set voice <mode|enabled|autoplay|longReply|maxChars> <value>, set speech <enabled|language|autoSend|silence|noSpeechGate|rmsThreshold|stopTtsOnSpeech|queueWhileAgentRuns> <value>, set generated media autoplay <value>, clear search preference, prefer/require search provider <alias>.",
  };
}

function surfaceAlias(raw: string): MessagingAmbientSurface | undefined {
  const normalized = normalizeCommand(raw);
  if (["chat", "chats", "thread", "threads", "conversation", "conversations"].includes(normalized)) return "chat";
  if (["project", "projects", "board", "boards"].includes(normalized)) return "projects";
  if (["workflow", "workflows", "workflow agent", "workflow agents", "workflow_agents", "agents"].includes(normalized))
    return "workflow_agents";
  if (["setting", "settings"].includes(normalized)) return "settings";
  if (["notification", "notifications", "status notifications", "notifications status", "notifications/status"].includes(normalized))
    return "notifications";
  return undefined;
}

function looksLikeReservedCommand(normalized: string): boolean {
  return /^(?:switch|show|list|open|create|new|start|set|enable|disable|clear|reset|prefer|require|approve|allow|deny|reject|decline|revoke|remove|delete|help|commands|status|summary)\b/.test(
    normalized,
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
