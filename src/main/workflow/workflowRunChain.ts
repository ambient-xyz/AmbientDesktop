import type { WorkflowModelCallRecord, WorkflowRunEvent } from "../../shared/types";
import type { ProjectStore } from "../projectStore/projectStore";

export function workflowResumeChainRunIds(store: ProjectStore, runId: string): string[] {
  const newestToOldest: string[] = [];
  const seen = new Set<string>();
  let currentRunId: string | undefined = runId;
  while (currentRunId && !seen.has(currentRunId)) {
    seen.add(currentRunId);
    newestToOldest.push(currentRunId);
    const resumeEvent: WorkflowRunEvent | undefined = store.listWorkflowRunEvents(currentRunId).find((event) => event.type === "workflow.resume");
    currentRunId = resumeEvent ? (resumeEvent.message ?? stringFromRecord(resumeEvent.data, "sourceRunId")) : undefined;
  }
  return newestToOldest.reverse();
}

export function workflowResumeChainEvents(store: ProjectStore, runId: string): WorkflowRunEvent[] {
  return workflowResumeChainRunIds(store, runId).flatMap((chainRunId) => store.listWorkflowRunEvents(chainRunId));
}

export function workflowResumeChainModelCalls(store: ProjectStore, runId: string): WorkflowModelCallRecord[] {
  return workflowResumeChainRunIds(store, runId).flatMap((chainRunId) => store.listWorkflowModelCalls({ runId: chainRunId }));
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
