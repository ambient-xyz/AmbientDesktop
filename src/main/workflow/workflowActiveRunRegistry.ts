export interface ActiveWorkflowRunRecord {
  controller: AbortController;
  workspacePath: string;
}

export interface WorkflowActiveRunRegistryDependencies<Host> {
  normalizeWorkspacePath(workspacePath: string): string;
  projectRuntimeHostForKnownWorkspacePath(workspacePath: string): Host | undefined;
  projectRuntimeHostForWorkspacePath(workspacePath: string): Host | undefined;
}

export interface WorkflowActiveRunRegistry<Host> {
  rememberActiveWorkflowRun(runId: string, controller: AbortController, workspacePath: string): void;
  activeWorkflowRunController(runId: string): AbortController | undefined;
  activeWorkflowRunHost(runId: string): Host | undefined;
  forgetActiveWorkflowRun(runId: string): void;
  forgetActiveWorkflowRunsForController(controller: AbortController): void;
}

export function createWorkflowActiveRunRegistry<Host>({
  normalizeWorkspacePath,
  projectRuntimeHostForKnownWorkspacePath,
  projectRuntimeHostForWorkspacePath,
}: WorkflowActiveRunRegistryDependencies<Host>): WorkflowActiveRunRegistry<Host> {
  const activeWorkflowRuns = new Map<string, ActiveWorkflowRunRecord>();

  return {
    rememberActiveWorkflowRun(runId, controller, workspacePath): void {
      activeWorkflowRuns.set(runId, {
        controller,
        workspacePath: normalizeWorkspacePath(workspacePath),
      });
    },

    activeWorkflowRunController(runId): AbortController | undefined {
      return activeWorkflowRuns.get(runId)?.controller;
    },

    activeWorkflowRunHost(runId): Host | undefined {
      const activeRun = activeWorkflowRuns.get(runId);
      if (!activeRun) return undefined;
      return projectRuntimeHostForKnownWorkspacePath(activeRun.workspacePath) ?? projectRuntimeHostForWorkspacePath(activeRun.workspacePath);
    },

    forgetActiveWorkflowRun(runId): void {
      activeWorkflowRuns.delete(runId);
    },

    forgetActiveWorkflowRunsForController(controller): void {
      for (const [runId, activeRun] of [...activeWorkflowRuns.entries()]) {
        if (activeRun.controller === controller) activeWorkflowRuns.delete(runId);
      }
    },
  };
}
