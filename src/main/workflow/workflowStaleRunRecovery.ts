import type { WorkflowRecoveryAction } from "../../shared/types";
import { workflowRunLiveness, type WorkflowRunLivenessOptions } from "../../shared/workflowRunLiveness";
import type { ProjectStore } from "../projectStore/projectStore";

export interface WorkflowStaleRunRecoveryInput {
  recoveryAction: WorkflowRecoveryAction;
  sourceEventId: string;
  reason: string;
}

export interface WorkflowStaleRunRecoveryResult {
  changed: boolean;
  summary: string;
  staleEventId?: string;
}

export function markStaleWorkflowRunForRecoveryIfNeeded(
  store: ProjectStore,
  runId: string,
  input: WorkflowStaleRunRecoveryInput,
  options: WorkflowRunLivenessOptions = {},
): WorkflowStaleRunRecoveryResult {
  const run = store.getWorkflowRun(runId);
  if (run.status !== "running") {
    return { changed: false, summary: "Workflow run is not running." };
  }
  const events = store.listWorkflowRunEvents(run.id);
  const liveness = workflowRunLiveness(run, events, options);
  if (!liveness.stale) {
    return { changed: false, summary: liveness.summary };
  }
  const staleEvent = store.appendWorkflowRunEvent({
    runId: run.id,
    type: "workflow.stale",
    message: "Workflow run marked stale before recovery.",
    data: {
      reason: input.reason,
      recoveryAction: input.recoveryAction,
      sourceEventId: input.sourceEventId,
      idleMs: liveness.idleMs,
      lastActivityAt: liveness.lastActivityAt,
      latestEventType: liveness.latestEventType,
    },
  });
  store.updateWorkflowRun({
    id: run.id,
    status: "failed",
    error: liveness.summary,
    finish: true,
  });
  return { changed: true, summary: liveness.summary, staleEventId: staleEvent.id };
}
