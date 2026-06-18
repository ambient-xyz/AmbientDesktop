import type { OrchestrationPrepareResult, OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { defaultOrchestrationProjectPath, type ProjectStore } from "../projectStore/projectStore";
import { prepareNextOrchestrationTasks } from "./orchestrationPrepare";
import { type WorkflowConfig } from "../workflow/workflow";
import {
  ensureDefaultProjectBoardWorkflow,
  type ProjectBoardWorkflowBootstrapResult,
} from "../project-board/projectBoardWorkflowBootstrap";
import {
  isRestartInterruptedOrchestrationRun,
  RESTART_INTERRUPTED_AUTO_CONTINUE_LIMIT,
  restartInterruptedAutoContinueAttempts,
  restartInterruptedNeedsManualReview,
} from "./orchestrationRecovery";
import type { SchedulerRuntimeState } from "./orchestrationScheduler";
import { isTaskBlockedByDependencies, isTaskStateActive, isTaskStateTerminal } from "./orchestrationScheduler";

export interface PrepareAndRecordResult {
  result: OrchestrationPrepareResult;
  runs: OrchestrationRun[];
}

export interface PrepareAndRecordDueScheduleResult extends PrepareAndRecordResult {
  evaluatedScheduleIds: string[];
  advancedScheduleIds: string[];
}

export type ProjectBoardWorkflowDispatchSource = "auto_dispatch" | "manual_prepare" | "preparation" | "scheduled_preparation";

export interface RestartInterruptedAutoContinueCandidate {
  run: OrchestrationRun;
  task: OrchestrationTask;
  autoContinueAttempts: number;
}

export interface AutoStartablePreparedRunCandidate {
  run: OrchestrationRun;
  task: OrchestrationTask;
}

export async function prepareAndRecordNextOrchestrationRuns(
  projectRoot: string,
  store: ProjectStore,
  workflowSource: ProjectBoardWorkflowDispatchSource = "preparation",
): Promise<PrepareAndRecordResult> {
  return prepareAndRecordOrchestrationRunsByProject(projectRoot, store, store.listOrchestrationTasks(), "preparation", {}, workflowSource);
}

export async function ensureProjectBoardWorkflowForDispatch(
  projectRoot: string,
  store: ProjectStore,
  source: ProjectBoardWorkflowDispatchSource,
): Promise<ProjectBoardWorkflowBootstrapResult | undefined> {
  const targetProjectRoot = defaultOrchestrationProjectPath(projectRoot);
  const board = store.getProjectBoardForPath(targetProjectRoot);
  if (!board || board.status === "archived") return undefined;
  const result = await ensureDefaultProjectBoardWorkflow(targetProjectRoot);
  if (result.status === "created") {
    store.recordProjectBoardWorkflowCreated({
      boardId: board.id,
      workflowPath: result.workflowPath,
      workflowHash: result.workflow?.contentHash,
      source,
      workspaceStrategy: result.workspaceStrategy,
      autoDispatch: result.workflow?.config.orchestration.autoDispatch,
      maxConcurrentAgents: result.workflow?.config.orchestration.maxConcurrentAgents,
    });
  }
  return result;
}

async function prepareAndRecordOrchestrationRunsByProject(
  fallbackProjectRoot: string,
  store: ProjectStore,
  tasks: OrchestrationTask[],
  proofKind: "preparation" | "scheduled-preparation",
  proofExtras: Record<string, unknown> | ((taskId: string) => Record<string, unknown>) = {},
  workflowSource: ProjectBoardWorkflowDispatchSource = "preparation",
): Promise<PrepareAndRecordResult> {
  const runs: OrchestrationRun[] = [];
  const combined: OrchestrationPrepareResult = {
    workflowPath: "",
    warnings: [],
    prepared: [],
    skipped: [],
  };
  const tasksByProject = new Map<string, OrchestrationTask[]>();
  const defaultProjectRoot = defaultOrchestrationProjectPath(fallbackProjectRoot);
  for (const task of tasks) {
    const targetProjectRoot = task.projectPath || defaultProjectRoot;
    tasksByProject.set(targetProjectRoot, [...(tasksByProject.get(targetProjectRoot) ?? []), task]);
  }

  for (const [targetProjectRoot, projectTasks] of tasksByProject) {
    await ensureProjectBoardWorkflowForDispatch(targetProjectRoot, store, workflowSource);
    const result = await prepareNextOrchestrationTasks(targetProjectRoot, projectTasks, {
      runtimeState: store.getOrchestrationSchedulerRuntimeState(),
    });
    combined.workflowPath = combined.workflowPath || result.workflowPath;
    combined.warnings.push(...result.warnings);
    combined.prepared.push(...result.prepared);
    combined.skipped.push(...result.skipped);
    for (const prepared of result.prepared) {
      store.setOrchestrationTaskWorkspace({
        id: prepared.taskId,
        workspacePath: prepared.workspacePath,
        branchName: prepared.branchName,
      });
      const dependencyArtifacts = await store.importProjectBoardDependencyArtifactsForTask({
        taskId: prepared.taskId,
        workspacePath: prepared.workspacePath,
      });
      const extras = typeof proofExtras === "function" ? proofExtras(prepared.taskId) : proofExtras;
      runs.push(
        store.recordPreparedOrchestrationRun({
          taskId: prepared.taskId,
          workspacePath: prepared.workspacePath,
          proofOfWork: {
            kind: proofKind,
            ...extras,
            dispatchRank: prepared.dispatchRank,
            priority: prepared.priority,
            identifier: prepared.identifier,
            title: prepared.title,
            projectPath: targetProjectRoot,
            workflowPath: prepared.workflowPath,
            workflowHash: prepared.workflowHash,
            strategy: prepared.strategy,
            workspaceKey: prepared.workspaceKey,
            createdNow: prepared.createdNow,
            branchName: prepared.branchName,
            baseRefs: prepared.baseRefs,
            hooks: prepared.hooks,
            dependencyArtifacts,
          },
        }),
      );
    }
  }

  return { result: combined, runs };
}

export function listAutoContinuableRestartInterruptedRuns(
  store: ProjectStore,
  input: {
    maxConcurrentAgents: number;
    maxAutoContinues?: number;
    runLimit?: number;
    runtimeState?: SchedulerRuntimeState;
  },
): RestartInterruptedAutoContinueCandidate[] {
  const runtimeState = input.runtimeState ?? store.getOrchestrationSchedulerRuntimeState();
  const availableSlots = Math.max(Math.floor(input.maxConcurrentAgents) - new Set(runtimeState.runningTaskIds).size, 0);
  if (availableSlots <= 0) return [];

  const maxAutoContinues = input.maxAutoContinues ?? RESTART_INTERRUPTED_AUTO_CONTINUE_LIMIT;
  if (maxAutoContinues <= 0) return [];

  const activeTaskIds = new Set([...runtimeState.claimedTaskIds, ...runtimeState.runningTaskIds, ...runtimeState.retryQueuedTaskIds]);
  const tasksById = new Map(store.listOrchestrationTasks().map((task) => [task.id, task]));
  return store
    .listOrchestrationRuns(input.runLimit ?? 500)
    .flatMap((run): RestartInterruptedAutoContinueCandidate[] => {
      const task = tasksById.get(run.taskId);
      if (!task) return [];
      if (!isRestartInterruptedOrchestrationRun(run)) return [];
      if (activeTaskIds.has(run.taskId)) return [];
      if (!run.threadId) return [];
      if (restartInterruptedNeedsManualReview(run)) return [];
      const autoContinueAttempts = restartInterruptedAutoContinueAttempts(run);
      if (autoContinueAttempts >= maxAutoContinues) return [];
      return [{ run, task, autoContinueAttempts }];
    })
    .sort(compareRestartInterruptedCandidatesForDispatch)
    .slice(0, availableSlots);
}

export function listAutoStartablePreparedOrchestrationRuns(
  store: ProjectStore,
  input: {
    workflowConfig: WorkflowConfig;
    maxRuns?: number;
    runtimeState?: SchedulerRuntimeState;
  },
): AutoStartablePreparedRunCandidate[] {
  const runtimeState = input.runtimeState ?? store.getOrchestrationSchedulerRuntimeState();
  const availableSlots = Math.max(input.workflowConfig.orchestration.maxConcurrentAgents - new Set(runtimeState.runningTaskIds).size, 0);
  if (availableSlots <= 0) return [];

  const tasks = store.listOrchestrationTasks();
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const runningTaskIds = new Set(runtimeState.runningTaskIds);
  const retryQueuedTaskIds = new Set(runtimeState.retryQueuedTaskIds);
  const runningByState = countRunningTasksByState(tasks, runningTaskIds);
  const selectedByState = new Map<string, number>();
  const selectedTaskIds = new Set<string>();
  const candidates: AutoStartablePreparedRunCandidate[] = [];

  const preparedRuns = store
    .listOrchestrationRuns(500)
    .filter((run) => run.status === "prepared")
    .map((run) => {
      const task = tasksById.get(run.taskId);
      return task ? { run, task } : undefined;
    })
    .filter((candidate): candidate is AutoStartablePreparedRunCandidate => Boolean(candidate))
    .sort(comparePreparedRunCandidatesForDispatch);

  for (const candidate of preparedRuns) {
    const { run, task } = candidate;
    if (selectedTaskIds.has(task.id)) continue;
    if (runningTaskIds.has(task.id) || retryQueuedTaskIds.has(task.id)) continue;
    const card = store.getProjectBoardCardForOrchestrationTask(task.id);
    if (card?.claimConflicts?.length) continue;
    if (card?.claim && !card.claim.ownedByLocal) continue;
    if (!isTaskStateActive(task.state, input.workflowConfig) || isTaskStateTerminal(task.state, input.workflowConfig)) continue;
    if (isTaskBlockedByDependencies(task, tasks, input.workflowConfig)) continue;
    if (candidates.length >= availableSlots) break;

    const state = task.state.trim().toLowerCase();
    const stateLimit = input.workflowConfig.orchestration.maxConcurrentAgentsByState[state] ?? input.workflowConfig.orchestration.maxConcurrentAgents;
    const activeInState = (runningByState.get(state) ?? 0) + (selectedByState.get(state) ?? 0);
    if (activeInState >= stateLimit) continue;

    candidates.push({ run, task });
    selectedTaskIds.add(task.id);
    selectedByState.set(state, activeInState + 1);
  }

  return candidates.slice(0, input.maxRuns ?? candidates.length);
}

export async function prepareAndRecordDueScheduledLocalTaskRuns(
  projectRoot: string,
  store: ProjectStore,
  now = new Date(),
): Promise<PrepareAndRecordDueScheduleResult> {
  const dueSchedules = store.listDueAutomationSchedules(now).filter((schedule) => schedule.targetKind === "local_task");
  const scheduleIdsByTaskId = new Map<string, string[]>();
  for (const schedule of dueSchedules) {
    const scheduleIds = scheduleIdsByTaskId.get(schedule.targetId) ?? [];
    scheduleIds.push(schedule.id);
    scheduleIdsByTaskId.set(schedule.targetId, scheduleIds);
  }
  const tasks = store.listOrchestrationTasks().filter((task) => scheduleIdsByTaskId.has(task.id));
  const { result, runs } = await prepareAndRecordOrchestrationRunsByProject(
    projectRoot,
    store,
    tasks,
    "scheduled-preparation",
    (taskId) => ({
      scheduleIds: scheduleIdsByTaskId.get(taskId) ?? [],
      scheduledAt: now.toISOString(),
    }),
    "scheduled_preparation",
  );

  const advancedScheduleIds: string[] = [];
  for (const schedule of dueSchedules) {
    store.advanceAutomationSchedule(schedule.id, now);
    advancedScheduleIds.push(schedule.id);
  }

  return { result, runs, evaluatedScheduleIds: dueSchedules.map((schedule) => schedule.id), advancedScheduleIds };
}

function compareRestartInterruptedCandidatesForDispatch(
  left: RestartInterruptedAutoContinueCandidate,
  right: RestartInterruptedAutoContinueCandidate,
): number {
  const leftPriority = left.task.priority ?? Number.POSITIVE_INFINITY;
  const rightPriority = right.task.priority ?? Number.POSITIVE_INFINITY;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  const started = left.run.startedAt.localeCompare(right.run.startedAt);
  if (started !== 0) return started;
  return left.task.identifier.localeCompare(right.task.identifier);
}

function comparePreparedRunCandidatesForDispatch(left: AutoStartablePreparedRunCandidate, right: AutoStartablePreparedRunCandidate): number {
  const priority = compareTasksForDispatch(left.task, right.task);
  if (priority !== 0) return priority;
  const started = left.run.startedAt.localeCompare(right.run.startedAt);
  if (started !== 0) return started;
  return left.run.id.localeCompare(right.run.id);
}

function compareTasksForDispatch(left: OrchestrationTask, right: OrchestrationTask): number {
  const leftPriority = left.priority ?? Number.POSITIVE_INFINITY;
  const rightPriority = right.priority ?? Number.POSITIVE_INFINITY;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  const created = left.createdAt.localeCompare(right.createdAt);
  if (created !== 0) return created;
  return left.identifier.localeCompare(right.identifier);
}

function countRunningTasksByState(tasks: OrchestrationTask[], runningTaskIds: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!runningTaskIds.has(task.id)) continue;
    const state = task.state.trim().toLowerCase();
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return counts;
}
