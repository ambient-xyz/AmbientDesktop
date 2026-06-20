import type { ProjectStore } from "./workflowProjectStoreFacade";

export const WORKFLOW_TRACE_RETENTION_SWEEP_MS = 6 * 60 * 60 * 1000;
export const WORKFLOW_TRACE_RETENTION_MIN_SWEEP_MS = 60_000;

type WorkflowTraceRetentionTimer = ReturnType<typeof setTimeout>;

export type WorkflowTraceRetentionSweepReason = "startup" | "workspace-switch" | "scheduled";

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

export interface WorkflowTraceRetentionHost {
  workspacePath: string;
  store: Pick<ProjectStore, "compactExpiredWorkflowTraceData">;
}

export interface WorkflowTraceRetentionService<Host extends WorkflowTraceRetentionHost> {
  stopWorkflowTraceRetentionSweep(): void;
  scheduleWorkflowTraceRetentionSweep(delayMs?: number): void;
  runWorkflowTraceRetentionSweep(reason: WorkflowTraceRetentionSweepReason, host: Host): void;
}

export interface WorkflowTraceRetentionServiceDependencies<Host extends WorkflowTraceRetentionHost> {
  projectRuntimeHostList(): Host[];
  emitWorkflowUpdated(workspacePath: string): void;
  sweepIntervalMs?: number;
  setTimeout(callback: () => void, delayMs: number): WorkflowTraceRetentionTimer;
  clearTimeout(timer: WorkflowTraceRetentionTimer): void;
  log(message: string): void;
  warn(message: string): void;
}

export function createWorkflowTraceRetentionService<Host extends WorkflowTraceRetentionHost>({
  projectRuntimeHostList,
  emitWorkflowUpdated,
  sweepIntervalMs = WORKFLOW_TRACE_RETENTION_SWEEP_MS,
  setTimeout: setTimeoutFn,
  clearTimeout: clearTimeoutFn,
  log,
  warn,
}: WorkflowTraceRetentionServiceDependencies<Host>): WorkflowTraceRetentionService<Host> {
  let workflowTraceRetentionTimer: WorkflowTraceRetentionTimer | undefined;

  function stopWorkflowTraceRetentionSweep(): void {
    if (workflowTraceRetentionTimer) clearTimeoutFn(workflowTraceRetentionTimer);
    workflowTraceRetentionTimer = undefined;
  }

  function scheduleWorkflowTraceRetentionSweep(delayMs = sweepIntervalMs): void {
    stopWorkflowTraceRetentionSweep();
    workflowTraceRetentionTimer = setTimeoutFn(() => {
      workflowTraceRetentionTimer = undefined;
      for (const host of projectRuntimeHostList()) runWorkflowTraceRetentionSweep("scheduled", host);
      scheduleWorkflowTraceRetentionSweep();
    }, Math.max(WORKFLOW_TRACE_RETENTION_MIN_SWEEP_MS, delayMs));
    workflowTraceRetentionTimer.unref?.();
  }

  function runWorkflowTraceRetentionSweep(reason: WorkflowTraceRetentionSweepReason, host: Host): void {
    try {
      const result = compactExpiredWorkflowTraceData(host.store);
      if (!result.changed) return;
      log(
        `[workflow-retention] ${reason} sweep compacted ${result.eventsCompacted} event payload(s) and ${result.modelCallsCompacted} model call payload(s) for ${host.workspacePath} before ${result.cutoff}.`,
      );
      emitWorkflowUpdated(host.workspacePath);
    } catch (error) {
      warn(`[workflow-retention] ${reason} sweep failed for ${host.workspacePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    stopWorkflowTraceRetentionSweep,
    scheduleWorkflowTraceRetentionSweep,
    runWorkflowTraceRetentionSweep,
  };
}
