import type { MessagingGatewayRemoteSurfaceRuntimeEvent, RuntimeSurfaceSnapshot } from "../../../shared/messagingGateway";
import type { MessagingRemoteSurfaceCommandPreview } from "../agentRuntimeMessagingFacade";

export interface MessagingRemoteSurfaceCommandPendingProjectSwitchPlan {
  workspacePath: string;
  reason: string;
  projectName?: string;
}

export interface MessagingRemoteSurfaceCommandPendingProjectSwitch extends MessagingRemoteSurfaceCommandPendingProjectSwitchPlan {
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

export type MessagingRemoteSurfaceCommandPendingProjectSwitchAfterRunResult = "none" | "canceled" | "scheduled";

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
  recordRuntimeEvent: (input: RemoteSurfaceRuntimeEventCreateInput) => Pick<MessagingGatewayRemoteSurfaceRuntimeEvent, "id">;
  storePendingProjectSwitch: (projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch) => void;
  completeProjectSwitch: (projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch) => Promise<unknown> | unknown;
}

export interface MessagingRemoteSurfaceCommandProjectSwitchApplyResult {
  completedProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
}

export type RemoteSurfaceRuntimeEventCreateInput = Omit<MessagingGatewayRemoteSurfaceRuntimeEvent, "id" | "scheduledAt"> & {
  scheduledAt?: string;
};
export type RemoteSurfaceRuntimeEventPatchInput = Partial<Omit<MessagingGatewayRemoteSurfaceRuntimeEvent, "id" | "kind" | "scheduledAt">>;

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
    input.updateRuntimeEvent(
      projectSwitch.runtimeEventId,
      messagingRemoteSurfaceCommandSwitchProjectUnavailablePatch({
        message,
        failedAt: now(),
      }),
    );
    if (input.throwOnFailure) throw new Error(message);
    return "failed";
  }
  try {
    await input.switchProject({
      workspacePath: projectSwitch.workspacePath,
      reason: projectSwitch.reason,
    });
    input.updateRuntimeEvent(
      projectSwitch.runtimeEventId,
      messagingRemoteSurfaceCommandSwitchProjectCompletedPatch({
        projectName: projectSwitch.projectName,
        completedAt: now(),
      }),
    );
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.updateRuntimeEvent(
      projectSwitch.runtimeEventId,
      messagingRemoteSurfaceCommandSwitchProjectFailedPatch({
        projectName: projectSwitch.projectName,
        message,
        failedAt: now(),
      }),
    );
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
    input.updateRuntimeEvent(
      projectSwitch.runtimeEventId,
      messagingRemoteSurfaceCommandSwitchProjectCanceledPatch({
        canceledAt: now(),
      }),
    );
    return "canceled";
  }
  input.scheduleCompletion(projectSwitch);
  return "scheduled";
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
    summary: input.projectName ? `Active Ambient project switched to ${input.projectName}.` : "Active Ambient project switch completed.",
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
    summary: input.projectName ? `Active Ambient project switch to ${input.projectName} failed.` : "Active Ambient project switch failed.",
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
    summary:
      "Active Ambient project switch was canceled because the original runtime workspace was no longer active when the Pi turn finished.",
    canceledAt: input.canceledAt,
    relaySuggested: true,
  };
}
