import type { OrchestrationTask } from "../../shared/workflowTypes";
import type { WorkflowConfig } from "./orchestrationWorkflowFacade";

export type SchedulerSkipReason =
  | "inactive-state"
  | "terminal-state"
  | "already-claimed"
  | "already-running"
  | "retry-queued"
  | "blocked"
  | "global-concurrency"
  | "state-concurrency";

export interface SchedulerRuntimeState {
  claimedTaskIds: string[];
  runningTaskIds: string[];
  retryQueuedTaskIds: string[];
}

export interface SchedulerRejectedTask {
  task: OrchestrationTask;
  reason: SchedulerSkipReason;
}

export interface SchedulerSelection {
  selected: OrchestrationTask[];
  rejected: SchedulerRejectedTask[];
  availableSlots: number;
}

export const emptySchedulerRuntimeState: SchedulerRuntimeState = {
  claimedTaskIds: [],
  runningTaskIds: [],
  retryQueuedTaskIds: [],
};

export function selectDispatchableTasks(
  tasks: OrchestrationTask[],
  config: WorkflowConfig,
  runtimeState: SchedulerRuntimeState = emptySchedulerRuntimeState,
): SchedulerSelection {
  const runtime = runtimeSets(runtimeState);
  const sortedTasks = [...tasks].sort(compareTasksForDispatch);
  const selected: OrchestrationTask[] = [];
  const rejected: SchedulerRejectedTask[] = [];
  const runningByState = countRunningByState(tasks, runtime.runningTaskIds);
  const selectedByState = new Map<string, number>();
  const globalSlots = Math.max(config.orchestration.maxConcurrentAgents - runtime.runningTaskIds.size, 0);

  for (const task of sortedTasks) {
    const staticReason = staticSkipReason(task, tasks, config, runtime);
    if (staticReason) {
      rejected.push({ task, reason: staticReason });
      continue;
    }

    if (selected.length >= globalSlots) {
      rejected.push({ task, reason: "global-concurrency" });
      continue;
    }

    const state = normalizeState(task.state);
    const stateLimit = config.orchestration.maxConcurrentAgentsByState[state] ?? config.orchestration.maxConcurrentAgents;
    const activeInState = (runningByState.get(state) ?? 0) + (selectedByState.get(state) ?? 0);
    if (activeInState >= stateLimit) {
      rejected.push({ task, reason: "state-concurrency" });
      continue;
    }

    selected.push(task);
    selectedByState.set(state, (selectedByState.get(state) ?? 0) + 1);
  }

  return { selected, rejected, availableSlots: globalSlots };
}

export function claimSelectedTasks(runtimeState: SchedulerRuntimeState, tasks: OrchestrationTask[]): SchedulerRuntimeState {
  const claimed = new Set(runtimeState.claimedTaskIds);
  for (const task of tasks) claimed.add(task.id);
  return {
    claimedTaskIds: [...claimed],
    runningTaskIds: [...new Set(runtimeState.runningTaskIds)],
    retryQueuedTaskIds: [...new Set(runtimeState.retryQueuedTaskIds)],
  };
}

export function isTaskStateActive(state: string, config: WorkflowConfig): boolean {
  return config.tracker.activeStates.includes(normalizeState(state));
}

export function isTaskStateTerminal(state: string, config: WorkflowConfig): boolean {
  return config.tracker.terminalStates.includes(normalizeState(state));
}

function staticSkipReason(
  task: OrchestrationTask,
  allTasks: OrchestrationTask[],
  config: WorkflowConfig,
  runtime: ReturnType<typeof runtimeSets>,
): SchedulerSkipReason | undefined {
  if (isTaskStateTerminal(task.state, config)) return "terminal-state";
  if (!isTaskStateActive(task.state, config)) return "inactive-state";
  if (runtime.runningTaskIds.has(task.id)) return "already-running";
  if (runtime.claimedTaskIds.has(task.id)) return "already-claimed";
  if (runtime.retryQueuedTaskIds.has(task.id)) return "retry-queued";
  if (isTaskBlockedByDependencies(task, allTasks, config)) return "blocked";
  return undefined;
}

export function isTaskBlockedByDependencies(task: OrchestrationTask, allTasks: OrchestrationTask[], config: WorkflowConfig): boolean {
  if (task.blockedBy.length === 0) return false;
  const tasksById = new Map(allTasks.map((candidate) => [candidate.id, candidate]));
  const tasksByIdentifier = new Map(allTasks.map((candidate) => [candidate.identifier, candidate]));
  const acceptableStates = dependencySatisfiedStates(config);

  return task.blockedBy.some((blockerRef) => {
    const blocker = tasksById.get(blockerRef) ?? tasksByIdentifier.get(blockerRef);
    if (!blocker) return true;
    return !acceptableStates.has(normalizeState(blocker.state));
  });
}

function dependencySatisfiedStates(config: WorkflowConfig): Set<string> {
  const unsatisfiedTerminalStates = new Set(["canceled", "cancelled", "duplicate", "failed", "needs_info", "terminal_blocker", "budget_exhausted"]);
  const states = [...config.tracker.reviewStates, ...config.tracker.terminalStates.filter((state) => !unsatisfiedTerminalStates.has(normalizeState(state)))];
  return new Set(states.map(normalizeState));
}

function countRunningByState(tasks: OrchestrationTask[], runningTaskIds: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!runningTaskIds.has(task.id)) continue;
    const state = normalizeState(task.state);
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return counts;
}

function compareTasksForDispatch(left: OrchestrationTask, right: OrchestrationTask): number {
  const leftPriority = left.priority ?? Number.POSITIVE_INFINITY;
  const rightPriority = right.priority ?? Number.POSITIVE_INFINITY;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  const created = left.createdAt.localeCompare(right.createdAt);
  if (created !== 0) return created;
  return left.identifier.localeCompare(right.identifier);
}

function runtimeSets(runtimeState: SchedulerRuntimeState): {
  claimedTaskIds: Set<string>;
  runningTaskIds: Set<string>;
  retryQueuedTaskIds: Set<string>;
} {
  return {
    claimedTaskIds: new Set(runtimeState.claimedTaskIds),
    runningTaskIds: new Set(runtimeState.runningTaskIds),
    retryQueuedTaskIds: new Set(runtimeState.retryQueuedTaskIds),
  };
}

function normalizeState(state: string): string {
  return state.trim().toLowerCase();
}
