import type { MessagingBindingDescriptor, MessagingProjection } from "../../shared/messagingGateway";
import { messagingProjectionText } from "./messagingGatewayProjection";
import type {
  MessagingRemoteSurfaceCommandKind,
  MessagingRemoteSurfaceCommandPreview,
  MessagingRemoteSurfaceCommandResult,
  MessagingRemoteSurfaceProjectCreateRequest,
  MessagingRemoteSurfaceSettingUpdateRequest,
  MessagingRemoteSurfaceWorkflowActionKind,
  MessagingRemoteSurfaceWorkflowActionRequest,
  MessagingRemoteSurfaceWorkflowActionResult,
  MessagingRemoteSurfaceWorkflowCreateRequest,
} from "./messagingRemoteSurfaceCommandTypes";

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
    preview.targetPermissionGrant
      ? `Target permission grant: ${preview.targetPermissionGrant.targetLabel} (${preview.targetPermissionGrant.id})`
      : undefined,
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
    result.scheduledProjectSwitch
      ? `Scheduled active project switch: ${result.scheduledProjectSwitch.name} (${result.scheduledProjectSwitch.path})`
      : undefined,
    result.completedProjectSwitch
      ? `Completed active project switch: ${result.completedProjectSwitch.name} (${result.completedProjectSwitch.path})`
      : undefined,
    result.createdProject ? `Created project: ${result.createdProject.name} (${result.createdProject.path})` : undefined,
    result.createdChat ? `Created chat: ${result.createdChat.title} (${result.createdChat.id})` : undefined,
    result.createdWorkflow ? `Created workflow: ${result.createdWorkflow.title} (${result.createdWorkflow.id})` : undefined,
    result.answeredQuestion ? `Answered question: ${result.answeredQuestion.id}` : undefined,
    result.workflowActionResult ? `Workflow action result: ${workflowActionResultSummary(result.workflowActionResult)}` : undefined,
    result.respondedApproval
      ? `Responded to approval: ${result.respondedApproval.title} (${result.respondedApproval.response})`
      : undefined,
    result.revokedPermissionGrant
      ? `Revoked permission grant: ${result.revokedPermissionGrant.targetLabel} (${result.revokedPermissionGrant.grantId})`
      : undefined,
    result.updatedSetting
      ? `Updated setting: ${result.updatedSetting.settingKey}; changed=${result.updatedSetting.changed ? "yes" : "no"}`
      : undefined,
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
    preview.targetPermissionGrant
      ? `Target permission grant: ${preview.targetPermissionGrant.targetLabel} (${preview.targetPermissionGrant.id})`
      : undefined,
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
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function remoteSurfaceCommandHelpProjection(binding?: MessagingBindingDescriptor): MessagingProjection {
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

export function nextStepsForCommand(kind: MessagingRemoteSurfaceCommandKind): string[] {
  if (kind === "show_status") return ["Apply to render the current bound surface projection without mutating provider or binding state."];
  if (kind === "help") return ["Apply to render supported Remote Ambient Surface commands."];
  if (kind === "switch_surface")
    return [
      "Apply to persist the binding navigation target, then send the resulting projection through the approved reply path if needed.",
    ];
  if (kind === "open_project")
    return ["Apply to persist the selected project scope, then send the project projection through the approved reply path if needed."];
  if (kind === "switch_project")
    return [
      "Ask the user to approve switching the active Ambient project after this Pi turn finishes, then send confirmation through the approved reply path if needed.",
    ];
  if (kind === "create_project")
    return [
      "Ask the user to approve creating this Ambient project workspace, then send the refreshed project projection through the approved reply path if needed.",
    ];
  if (kind === "open_chat")
    return ["Apply to persist the selected chat scope, then send the chat status projection through the approved reply path if needed."];
  if (kind === "create_chat")
    return [
      "Ask the user to approve creating this Ambient chat thread, then send the refreshed chat projection through the approved reply path if needed.",
    ];
  if (kind === "open_workflow")
    return [
      "Apply to persist the selected workflow scope, then send the workflow status projection through the approved reply path if needed.",
    ];
  if (kind === "create_workflow")
    return [
      "Ask the user to approve creating this Ambient Workflow Agent thread, then send the refreshed workflow projection through the approved reply path if needed.",
    ];
  if (kind === "workflow_action")
    return [
      "Ask the user to approve this Workflow Agent runtime action, then send the refreshed workflow projection through the approved reply path if needed.",
    ];
  if (kind === "answer_workflow_question")
    return [
      "Ask the user to approve recording this workflow discovery answer, then send the refreshed workflow projection through the approved reply path if needed.",
    ];
  if (kind === "respond_approval")
    return [
      "Apply to resolve the selected pending permission prompt. This command is already the owner's approval decision and does not trigger a second approval prompt.",
    ];
  if (kind === "revoke_permission_grant")
    return [
      "Apply to revoke the selected reusable permission grant. This command is already an owner-authenticated recovery action and does not trigger a second approval prompt.",
    ];
  if (kind === "update_setting")
    return [
      "Ask the user to approve this settings update, then send the refreshed settings projection through the approved reply path if needed.",
    ];
  return ["Ask the owner to use a supported Remote Ambient Surface command."];
}
function settingUpdateSummary(update: MessagingRemoteSurfaceSettingUpdateRequest): string {
  if (update.operation === "voice_policy") return `voice.${update.field}=${String(update.value)}`;
  if (update.operation === "stt_policy") return `stt.${update.field}=${String(update.value)}`;
  if (update.operation === "media_playback") return `media.${update.field}=${String(update.value)}`;
  if (update.operation === "thread_settings")
    return `thread.${update.field}=${String(update.value)}${update.threadTitle ? ` (${update.threadTitle})` : ""}`;
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
  ]
    .filter(Boolean)
    .join("; ");
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
  ]
    .filter(Boolean)
    .join("; ");
  return `${label}; changed=${result.changed ? "yes" : "no"}${detail ? `; ${detail}` : ""}`;
}

export function workflowActionLabel(action: MessagingRemoteSurfaceWorkflowActionKind): string {
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

export function previewText(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}...`;
}
