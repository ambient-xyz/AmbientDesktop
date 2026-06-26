import type { MessagingBindingDescriptor, MessagingBindingListResult, RuntimeSurfaceSnapshot } from "../../../shared/messagingGateway";
import {
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
  type MessagingRemoteSurfaceCommandPreview,
  type MessagingRemoteSurfaceCommandResult,
} from "../agentRuntimeMessagingFacade";

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
  const createdChat = input.createdChatThreadId ? input.surface.chats.find((chat) => chat.id === input.createdChatThreadId) : undefined;
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
