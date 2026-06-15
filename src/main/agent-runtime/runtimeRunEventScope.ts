import type {
  DesktopEvent,
  PlannerPlanArtifact,
  PlannerPlanFinalizationAttemptStatus,
  PlannerPlanWorkflowState,
} from "../../shared/types";

export interface RuntimeRunEventScopeInput {
  runWorkspacePath: string;
  plannerFinalizationSources: readonly Pick<PlannerPlanArtifact, "id">[];
  getCurrentWorkspacePath: () => string;
  emit: (event: DesktopEvent) => void;
  finishPlannerPlanFinalizationAttempt: (
    artifactId: string,
    input: {
      status: Exclude<PlannerPlanFinalizationAttemptStatus, "running">;
      workflowState?: PlannerPlanWorkflowState;
      error?: string;
    },
  ) => PlannerPlanArtifact;
  onActivity?: (() => void) | undefined;
  logWarning?: ((message: string) => void) | undefined;
}

export interface RuntimeRunEventScope {
  isRunStoreActive: () => boolean;
  emitRunEvent: (event: DesktopEvent) => void;
  markRunActivity: () => boolean;
  finishPlannerFinalizationSources: (
    status: Exclude<PlannerPlanFinalizationAttemptStatus, "running">,
    options?: { error?: string; workflowState?: PlannerPlanWorkflowState },
  ) => void;
  addActivityListener: (listener: () => void) => () => void;
  detachFromWorkspace: () => void;
}

export function createRuntimeRunEventScope(input: RuntimeRunEventScopeInput): RuntimeRunEventScope {
  let detachedFromWorkspace = false;
  const activeRunActivityListeners = new Set<() => void>();
  const warn = input.logWarning ?? ((message: string) => console.warn(message));

  const isRunStoreActive = () => {
    try {
      return !detachedFromWorkspace && input.getCurrentWorkspacePath() === input.runWorkspacePath;
    } catch {
      return false;
    }
  };

  const emitRunEvent = (event: DesktopEvent) => {
    if (isRunStoreActive()) input.emit(event);
  };

  const markRunActivity = () => {
    if (!isRunStoreActive()) return false;
    input.onActivity?.();
    for (const listener of [...activeRunActivityListeners]) listener();
    return true;
  };

  const finishPlannerFinalizationSources: RuntimeRunEventScope["finishPlannerFinalizationSources"] = (
    status,
    options = {},
  ) => {
    if (!input.plannerFinalizationSources.length || !isRunStoreActive()) return;
    for (const source of input.plannerFinalizationSources) {
      try {
        const artifact = input.finishPlannerPlanFinalizationAttempt(source.id, {
          status,
          workflowState: options.workflowState,
          error: options.error,
        });
        emitRunEvent({ type: "planner-plan-artifact-updated", artifact });
      } catch (error) {
        warn(`Failed to mark planner finalization ${status}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  return {
    isRunStoreActive,
    emitRunEvent,
    markRunActivity,
    finishPlannerFinalizationSources,
    addActivityListener: (listener) => {
      activeRunActivityListeners.add(listener);
      return () => {
        activeRunActivityListeners.delete(listener);
      };
    },
    detachFromWorkspace: () => {
      detachedFromWorkspace = true;
    },
  };
}
