import type { MessagingBindingDescriptor } from "../../../shared/messagingGateway";
import {
  messagingRemoteSurfaceCommandBindingUpdate,
  messagingRemoteSurfaceCommandChatCreateTitle,
  messagingRemoteSurfaceCommandProjectCreateRequest,
  messagingRemoteSurfaceCommandWorkflowCreateRequest,
  type MessagingRemoteSurfaceCommandBindingUpdate,
  type MessagingRemoteSurfaceCommandPreview,
} from "../agentRuntimeMessagingFacade";

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
  updateRemoteSurfaceScope: (update: MessagingRemoteSurfaceCommandBindingUpdate) => MessagingBindingDescriptor | undefined;
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
    input: NonNullable<MessagingRemoteSurfaceCommandApplyCreatePlan["projectCreateRequest"]>,
  ) => Promise<{ path: string }> | { path: string };
  createChatThread: (title: string, workspacePath: string) => { id: string };
  createWorkflowAgentThreadSummary: (input: MessagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput) => { id: string };
}

export interface MessagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput {
  title?: string;
  initialRequest: string;
  projectPath: string;
  traceMode: "production";
  phase: "discovery";
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
    ? input.createWorkflowAgentThreadSummary(
        messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput({
          workflowCreateRequest: createPlan.workflowCreateRequest,
          defaultProjectPath: input.defaultProjectPath,
        }),
      )
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
    ...(input.createdProjectPath
      ? [
          {
            ...base,
            ambientSurface: "projects" as const,
            projectId: input.createdProjectPath,
          },
        ]
      : []),
    ...(input.createdChatThreadId
      ? [
          {
            ...base,
            ambientSurface: "chat" as const,
            chatThreadId: input.createdChatThreadId,
          },
        ]
      : []),
    ...(input.createdWorkflowThreadId
      ? [
          {
            ...base,
            ambientSurface: "workflow_agents" as const,
            workflowId: input.createdWorkflowThreadId,
          },
        ]
      : []),
  ];
}
