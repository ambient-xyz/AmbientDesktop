import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary } from "../../shared/workflowTypes";

export type WorkflowArtifactThreadRouteKind = "workflow_thread" | "refresh_workflow_threads" | "legacy_only";

export interface WorkflowArtifactThreadRoute {
  kind: WorkflowArtifactThreadRouteKind;
  actionLabel: string;
  detail: string;
  workflowThreadId?: string;
  disabled: boolean;
}

export interface WorkflowArtifactThreadRouteInput {
  artifact?: Pick<WorkflowArtifactSummary, "workflowThreadId" | "title">;
  workflowThread?: Pick<WorkflowAgentThreadSummary, "id" | "title">;
}

export function workflowArtifactThreadRoute(input: WorkflowArtifactThreadRouteInput): WorkflowArtifactThreadRoute {
  const { artifact, workflowThread } = input;
  if (workflowThread) {
    return {
      kind: "workflow_thread",
      actionLabel: "Open Workflow Agent thread",
      detail: `${workflowThread.title || artifact?.title || "This workflow"} opens in the Workflow Agent thread with discovery, graph, versions, runs, and review together.`,
      workflowThreadId: workflowThread.id,
      disabled: false,
    };
  }
  if (artifact?.workflowThreadId) {
    return {
      kind: "refresh_workflow_threads",
      actionLabel: "Find Workflow Agent thread",
      detail: "This artifact is linked to a Workflow Agent thread, but the thread list needs to refresh before opening it.",
      workflowThreadId: artifact.workflowThreadId,
      disabled: false,
    };
  }
  return {
    kind: "legacy_only",
    actionLabel: "Workflow thread unavailable",
    detail: "This workflow artifact does not have a linked Workflow Agent thread. Create or recompile it from New Workflow to use the thread-first review surface.",
    disabled: true,
  };
}
