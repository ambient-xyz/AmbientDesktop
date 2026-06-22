import type { RuntimeSurfaceWorkflowRecoveryEvent } from "../../shared/messagingGateway";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  completeMessagingRemoteSurfaceCommandPendingProjectSwitch,
  type MessagingRemoteSurfaceCommandPendingProjectSwitch,
  type MessagingRemoteSurfaceCommandPendingProjectSwitchCompletionOptions,
} from "./messaging/agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import type { AgentRuntimeRemoteSurfaceRuntimeEventStore } from "./messaging/agentRuntimeRemoteSurfaceRuntimeEvents";
import { agentRuntimeWorkflowRecoveryEventsForRemoteSurface } from "./workflow-support/agentRuntimeWorkflowRecoveryEvents";

type RemoteSurfaceRuntimeEvents = Pick<AgentRuntimeRemoteSurfaceRuntimeEventStore, "update">;

export interface AgentRuntimeRemoteSurfaceControls {
  pendingProjectSwitchByThreadId: Map<string, MessagingRemoteSurfaceCommandPendingProjectSwitch>;
  completePendingProjectSwitch: (
    projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch,
    input?: { threadId?: string; workspacePath?: string; throwOnFailure?: boolean },
  ) => Promise<"completed" | "failed">;
  deletePendingProjectSwitch: (threadId: string) => void;
  takePendingProjectSwitch: (threadId: string) => MessagingRemoteSurfaceCommandPendingProjectSwitch | undefined;
  workflowRecoveryEvents: () => RuntimeSurfaceWorkflowRecoveryEvent[];
}

export interface AgentRuntimeRemoteSurfaceControlsInput {
  store: Pick<ProjectStore, "getWorkflowArtifact" | "listWorkflowAgentFolders" | "listWorkflowRunEvents">;
  features: Pick<AgentRuntimeFeatures, "projects">;
  remoteSurfaceRuntimeEvents: () => RemoteSurfaceRuntimeEvents;
  emitError: NonNullable<MessagingRemoteSurfaceCommandPendingProjectSwitchCompletionOptions["emitError"]>;
}

export function createAgentRuntimeRemoteSurfaceControls({
  emitError,
  features,
  remoteSurfaceRuntimeEvents,
  store,
}: AgentRuntimeRemoteSurfaceControlsInput): AgentRuntimeRemoteSurfaceControls {
  const pendingProjectSwitchByThreadId = new Map<string, MessagingRemoteSurfaceCommandPendingProjectSwitch>();
  return {
    pendingProjectSwitchByThreadId,
    async completePendingProjectSwitch(projectSwitch, input = {}) {
      const switchProject = features.projects?.switchProject;
      return completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
        projectSwitch,
        ...(switchProject ? { switchProject } : {}),
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
        ...(input.throwOnFailure !== undefined ? { throwOnFailure: input.throwOnFailure } : {}),
        updateRuntimeEvent: (eventId, patch) => remoteSurfaceRuntimeEvents().update(eventId, patch),
        emitError,
      });
    },
    deletePendingProjectSwitch(threadId) {
      pendingProjectSwitchByThreadId.delete(threadId);
    },
    takePendingProjectSwitch(threadId) {
      const pendingProjectSwitch = pendingProjectSwitchByThreadId.get(threadId);
      pendingProjectSwitchByThreadId.delete(threadId);
      return pendingProjectSwitch;
    },
    workflowRecoveryEvents() {
      return agentRuntimeWorkflowRecoveryEventsForRemoteSurface({
        workflowFolders: store.listWorkflowAgentFolders(),
        getWorkflowArtifact: (artifactId) => store.getWorkflowArtifact(artifactId),
        listWorkflowRunEvents: (runId) => store.listWorkflowRunEvents(runId),
      });
    },
  };
}
