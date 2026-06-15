import type { ProjectStore } from "./projectStore";

export const WORKFLOW_TRACE_RETENTION_SWEEP_MS = 6 * 60 * 60 * 1000;

export interface WorkflowTraceRetentionSweepResult {
  cutoff: string;
  eventsCompacted: number;
  modelCallsCompacted: number;
  changed: boolean;
}

export function compactExpiredWorkflowTraceData(
  store: Pick<ProjectStore, "compactExpiredWorkflowTraceData">,
  input: { now?: string; debugRetentionDays?: number } = {},
): WorkflowTraceRetentionSweepResult {
  const result = store.compactExpiredWorkflowTraceData(input);
  return {
    ...result,
    changed: result.eventsCompacted > 0 || result.modelCallsCompacted > 0,
  };
}
