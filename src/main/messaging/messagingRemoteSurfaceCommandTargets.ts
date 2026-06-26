import type { MessagingBindingDescriptor, RuntimeSurfaceSnapshot } from "../../shared/messagingGateway";
import type { WorkflowRecoveryAction } from "../../shared/workflowTypes";
import type {
  MessagingRemoteSurfaceProjectCreateRequest,
  MessagingRemoteSurfaceWorkflowActionKind,
  MessagingRemoteSurfaceWorkflowActionRequest,
  MessagingRemoteSurfaceWorkflowCreateRequest,
} from "./messagingRemoteSurfaceCommandTypes";
import { workflowActionLabel } from "./messagingRemoteSurfaceCommandText";
import { normalizeCommand } from "./messagingRemoteSurfaceCommandParsing";

export function createProjectCommand(rawRequest: string): {
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

export function projectCommand(
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
  const byIndex = Number.isFinite(index) && String(index) === target ? surface.projects[index - 1] : undefined;
  const normalizedTarget = normalizeCommand(target);
  const byId = surface.projects.find(
    (project) => normalizeCommand(project.id) === normalizedTarget || normalizeCommand(project.path) === normalizedTarget,
  );
  const byName =
    surface.projects.find((project) => normalizeCommand(project.name) === normalizedTarget) ??
    surface.projects.find((project) => normalizeCommand(project.name).includes(normalizedTarget));
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

export function createChatCommand(rawTitle: string): {
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

export function createWorkflowCommand(rawRequest: string): {
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

export function chatCommand(
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
  const byIndex = Number.isFinite(index) && String(index) === target ? surface.chats[index - 1] : undefined;
  const normalizedTarget = normalizeCommand(target);
  const byId = surface.chats.find((chat) => normalizeCommand(chat.id) === normalizedTarget);
  const byTitle =
    surface.chats.find((chat) => normalizeCommand(chat.title) === normalizedTarget) ??
    surface.chats.find((chat) => normalizeCommand(chat.title).includes(normalizedTarget));
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

export function answerWorkflowQuestionCommand(
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

export function selectedWorkflowForAnswer(
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
  const choice =
    (letterIndex >= 0 ? choices[letterIndex] : undefined) ??
    (numericIndex >= 0 ? choices[numericIndex] : undefined) ??
    choices.find((item) => normalizeCommand(item.id) === normalizedAnswer) ??
    choices.find((item) => normalizeCommand(item.label) === normalizedAnswer);
  if (choice) return { choiceId: choice.id };
  if (workflow.waitingQuestionAllowFreeform) return { freeform: answer };
  return {
    blocker: choices.length
      ? `Answer did not match a valid choice for "${workflow.title}". Use A-${String.fromCharCode(64 + choices.length)}, a choice id, or an exact choice label.`
      : `Workflow "${workflow.title}" does not allow a freeform answer for this question.`,
  };
}

export function workflowCommand(
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
  const byIndex = Number.isFinite(index) && String(index) === target ? surface.workflowAgents[index - 1] : undefined;
  const normalizedTarget = normalizeCommand(target);
  const byId = surface.workflowAgents.find((workflow) => normalizeCommand(workflow.id) === normalizedTarget);
  const byTitle =
    surface.workflowAgents.find((workflow) => normalizeCommand(workflow.title) === normalizedTarget) ??
    surface.workflowAgents.find((workflow) => normalizeCommand(workflow.title).includes(normalizedTarget));
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

export function workflowActionCommand(
  normalized: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
):
  | {
      kind: "workflow_action";
      targetSurface: "workflow_agents";
      targetWorkflow?: RuntimeSurfaceSnapshot["workflowAgents"][number];
      targetWorkflowAction?: MessagingRemoteSurfaceWorkflowActionRequest;
      blocker?: string;
    }
  | undefined {
  const runExploration =
    normalized.match(/^(?:run|start)\s+(?:workflow\s+)?exploration(?:\s+(?:for|on)\s+(.+))?$/) ??
    normalized.match(/^explore\s+(?:workflow\s+)?(.+)?$/);
  if (runExploration) {
    return workflowActionCommandForTarget("run_exploration", runExploration[1], binding, surface);
  }

  const compile =
    normalized.match(/^(?:compile|finalize)\s+(?:workflow|selected workflow|from exploration)(?:\s+(?:for|on)\s+(.+))?$/) ??
    normalized.match(/^compile\s+from\s+exploration(?:\s+(?:for|on)\s+(.+))?$/) ??
    normalized.match(/^compile\s+workflow\s+preview(?:\s+(?:for|on)\s+(.+))?$/);
  if (compile) {
    return workflowActionCommandForTarget("compile_preview", compile[1], binding, surface);
  }

  const approveArtifact = normalized.match(
    /^(?:approve|accept)\s+(?:workflow(?:\s+preview)?|workflow\s+artifact|artifact|preview)(?:\s+(?:for|on)\s+(.+))?$/,
  );
  if (approveArtifact) {
    return workflowActionCommandForTarget("approve_artifact", approveArtifact[1], binding, surface);
  }

  const rejectArtifact = normalized.match(
    /^(?:reject|decline)\s+(?:workflow(?:\s+preview)?|workflow\s+artifact|artifact|preview)(?:\s+(?:for|on)\s+(.+))?$/,
  );
  if (rejectArtifact) {
    return workflowActionCommandForTarget("reject_artifact", rejectArtifact[1], binding, surface);
  }

  const retryFailed =
    normalized.match(/^(?:retry|rerun)\s+(?:failed\s+)?(?:step|event)(?:\s+(\d+))?(?:\s+(?:for|on)\s+(.+))?$/) ??
    normalized.match(/^(?:retry|rerun)\s+failed(?:\s+(\d+))?(?:\s+(?:for|on)\s+(.+))?$/);
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
  const targetWorkflow = rawTarget?.trim() ? resolveWorkflowTarget(rawTarget, surface) : selectedWorkflowForCommand(binding, surface);
  if (!targetWorkflow) {
    return {
      kind: "workflow_action",
      targetSurface: "workflow_agents",
      blocker:
        "No selected workflow was found. Open a failed workflow first, then retry failed step, resume checkpoint, or skip failed item.",
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
      candidate.commandExamples?.length
        ? candidate.commandExamples
        : [`${workflowActionCommandExample(action)} ${events.indexOf(candidate) + 1}`],
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
  const targetWorkflow = rawTarget?.trim() ? resolveWorkflowTarget(rawTarget, surface) : selectedWorkflowForCommand(binding, surface);
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
  return (
    workflow.phase === "ready_for_review" ||
    workflow.latestVersion?.status === "ready_for_review" ||
    workflow.latestRun?.status === "previewed"
  );
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
  return (
    surface.workflowAgents.find((workflow) => normalizeCommand(workflow.id) === normalizedTarget) ??
    surface.workflowAgents.find((workflow) => normalizeCommand(workflow.title) === normalizedTarget) ??
    surface.workflowAgents.find((workflow) => normalizeCommand(workflow.title).includes(normalizedTarget))
  );
}

function looksLikePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("~") || value.startsWith(".");
}
