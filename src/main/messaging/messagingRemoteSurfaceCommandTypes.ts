import type {
  MessagingAmbientSurface,
  MessagingBindingDescriptor,
  MessagingGatewayQueuedProjection,
  MessagingInboundEvent,
  MessagingProjection,
  RuntimeSurfaceApprovalResponseMode,
  RuntimeSurfaceSnapshot,
} from "../../shared/messagingGateway";
import type { WorkflowDiscoveryQuestion, WorkflowRecoveryAction } from "../../shared/workflowTypes";

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
