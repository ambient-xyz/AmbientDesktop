import type { AnswerWorkflowDiscoveryQuestionInput, WorkflowDiscoveryQuestion } from "../../../shared/workflowTypes";
import {
  messagingRemoteSurfaceCommandApprovalResponse,
  messagingRemoteSurfaceCommandGrantRevokeRequest,
  messagingRemoteSurfaceCommandSettingUpdateRequest,
  messagingRemoteSurfaceCommandWorkflowActionRequest,
  messagingRemoteSurfaceCommandWorkflowAnswerInput,
  type MessagingRemoteSurfaceCommandPreview,
  type MessagingRemoteSurfaceCommandResult,
  type MessagingRemoteSurfaceSettingUpdateRequest,
  type MessagingRemoteSurfaceSettingUpdateResult,
  type MessagingRemoteSurfaceWorkflowActionRequest,
  type MessagingRemoteSurfaceWorkflowActionResult,
} from "../agentRuntimeMessagingFacade";

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
    input: MessagingRemoteSurfaceWorkflowActionRequest,
  ) => Promise<MessagingRemoteSurfaceWorkflowActionResult> | MessagingRemoteSurfaceWorkflowActionResult;
  applySettingUpdate: (
    input: MessagingRemoteSurfaceSettingUpdateRequest,
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
