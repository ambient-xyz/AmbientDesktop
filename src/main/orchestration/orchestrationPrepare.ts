import { join } from "node:path";
import type {
  OrchestrationHookLog,
  OrchestrationPrepareResult,
  OrchestrationTask,
  PreparedOrchestrationTask,
} from "../../shared/types";
import { loadWorkflowFile, type WorkflowConfig, type WorkflowDefinition } from "../workflow/workflow";
import { prepareTaskWorkspace, type PreparedTaskWorkspace } from "./orchestrationWorkspace";
import {
  emptySchedulerRuntimeState,
  selectDispatchableTasks,
  type SchedulerRejectedTask,
  type SchedulerRuntimeState,
} from "./orchestrationScheduler";
import { runWorkflowHook, type WorkflowHookResult } from "./orchestrationHooks";

export interface PrepareNextTasksOptions {
  runtimeState?: SchedulerRuntimeState;
  maxHookOutputChars?: number;
}

export async function prepareNextOrchestrationTasks(
  projectRoot: string,
  tasks: OrchestrationTask[],
  options: PrepareNextTasksOptions = {},
): Promise<OrchestrationPrepareResult> {
  const workflow = await loadWorkflowFile(join(projectRoot, "WORKFLOW.md"));
  const selection = selectDispatchableTasks(tasks, workflow.config, options.runtimeState ?? emptySchedulerRuntimeState);
  const prepared: PreparedOrchestrationTask[] = [];
  const skipped = selection.rejected.map(skippedTaskFromRejection);

  for (const [index, task] of selection.selected.entries()) {
    prepared.push(await prepareSelectedTask(projectRoot, task, tasks, workflow, options.maxHookOutputChars, index + 1));
  }

  return {
    workflowPath: workflow.path,
    warnings: workflow.warnings,
    prepared,
    skipped,
  };
}

async function prepareSelectedTask(
  projectRoot: string,
  task: OrchestrationTask,
  allTasks: OrchestrationTask[],
  workflow: WorkflowDefinition,
  maxHookOutputChars: number | undefined,
  dispatchRank: number,
): Promise<PreparedOrchestrationTask> {
  const baseRefs = dependencyBranchRefsForTask(task, allTasks);
  const workspace = await prepareTaskWorkspace(projectRoot, task, workflow.config, baseRefs);
  const hooks = await runPreparationHooks(workspace, workflow.config, maxHookOutputChars);

  return {
    taskId: task.id,
    identifier: task.identifier,
    title: task.title,
    priority: task.priority,
    dispatchRank,
    workflowPath: workflow.path,
    workflowHash: workflow.contentHash,
    workspacePath: workspace.path,
    workspaceKey: workspace.workspaceKey,
    createdNow: workspace.createdNow,
    strategy: workspace.strategy,
    ...(workspace.branchName ? { branchName: workspace.branchName } : {}),
    ...(workspace.baseRefs.length ? { baseRefs: workspace.baseRefs } : {}),
    hooks,
  };
}

function dependencyBranchRefsForTask(task: OrchestrationTask, allTasks: OrchestrationTask[]): string[] {
  if (task.blockedBy.length === 0) return [];
  const tasksById = new Map(allTasks.map((candidate) => [candidate.id, candidate]));
  const tasksByIdentifier = new Map(allTasks.map((candidate) => [candidate.identifier, candidate]));
  const refs: string[] = [];
  for (const blockerRef of task.blockedBy) {
    const blocker = tasksById.get(blockerRef) ?? tasksByIdentifier.get(blockerRef);
    if (blocker?.branchName) refs.push(blocker.branchName);
  }
  return [...new Set(refs)];
}

async function runPreparationHooks(
  workspace: PreparedTaskWorkspace,
  config: WorkflowConfig,
  maxHookOutputChars: number | undefined,
): Promise<OrchestrationHookLog[]> {
  const hooks: OrchestrationHookLog[] = [];
  if (workspace.createdNow) {
    const afterCreate = await runWorkflowHook("afterCreate", config.hooks.afterCreate, workspace.path, {
      timeoutMs: config.hooks.timeoutMs,
      maxOutputChars: maxHookOutputChars,
      permissionMode: config.agent.permissionMode ?? "full-access",
      workspacePath: workspace.path,
    });
    if (afterCreate) hooks.push(mapHookLog(afterCreate));
    if (afterCreate && !afterCreate.ok) return hooks;
  }

  const beforeRun = await runWorkflowHook("beforeRun", config.hooks.beforeRun, workspace.path, {
    timeoutMs: config.hooks.timeoutMs,
    maxOutputChars: maxHookOutputChars,
    permissionMode: config.agent.permissionMode ?? "full-access",
    workspacePath: workspace.path,
  });
  if (beforeRun) hooks.push(mapHookLog(beforeRun));
  return hooks;
}

function skippedTaskFromRejection(rejection: SchedulerRejectedTask) {
  return {
    taskId: rejection.task.id,
    identifier: rejection.task.identifier,
    title: rejection.task.title,
    reason: rejection.reason,
  };
}

function mapHookLog(result: WorkflowHookResult): OrchestrationHookLog {
  return { ...result };
}
