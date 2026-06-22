import type { AutomationFolderSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { OrchestrationBoard, OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { LocalTaskBoard, LocalTasksPane } from "./AutomationsLocalTaskBoard";
import type { useAutomationsLocalTaskController } from "./AutomationsLocalTaskController";
import { ProofOfWorkPreview } from "./AutomationsProofPreviewViews";
import { AutoDispatchStatusView, AutoDispatchToggle, LocalTaskRunList, PrepareResultView } from "./AutomationsRunHistory";
import { AutomationProjectField, type AutomationProjectOption } from "./AutomationsWorkspaceShellViews";
import { AutomationFolderPane } from "./AutomationsWorkflowUtilityViews";

export type AutomationsLocalTaskPaneTooltips = {
  project: string;
  autoDispatch: string;
  localTasks: string;
  triggerMode: string;
  schedules: string;
  recentRuns: string;
};

export type AutomationsLocalTaskControllerForRenderers = Pick<
  ReturnType<typeof useAutomationsLocalTaskController>,
  | "allowTaskDrop"
  | "autoDispatchBusy"
  | "cancelingRunId"
  | "cancelOrchestrationRun"
  | "cancelTaskEdit"
  | "clearTaskBlockerDraft"
  | "createTask"
  | "draggingTaskId"
  | "dropTaskOnState"
  | "endTaskDrag"
  | "prepareBusy"
  | "prepareNextTasks"
  | "prepareResult"
  | "revealOrchestrationWorkspace"
  | "saveTaskEdit"
  | "setAutoDispatch"
  | "setTaskBlockerDraft"
  | "setTaskDescription"
  | "setTaskEditDescription"
  | "setTaskEditTitle"
  | "setTaskInitialState"
  | "setTaskLabels"
  | "setTaskPriority"
  | "setTaskScheduleExpression"
  | "setTaskSchedulePreset"
  | "setTaskTitle"
  | "setTaskTriggerMode"
  | "startOrchestrationRun"
  | "startingRunId"
  | "startTaskDrag"
  | "startTaskEdit"
  | "taskBlockerDrafts"
  | "taskBusy"
  | "taskDescription"
  | "taskEditBusyId"
  | "taskEditDescription"
  | "taskEditId"
  | "taskEditTitle"
  | "taskInitialState"
  | "taskLabels"
  | "taskPriority"
  | "taskScheduleExpression"
  | "taskSchedulePreset"
  | "taskTitle"
  | "taskTriggerMode"
  | "updateTaskBlockers"
  | "updateTaskLabels"
  | "updateTaskPriority"
  | "updateTaskState"
>;

export type AutomationsLocalTaskPaneRenderersInput = {
  autoDispatchStatus?: Parameters<typeof AutoDispatchStatusView>[0]["status"];
  orchestrationBoard?: Pick<OrchestrationBoard, "runs" | "tasks" | "workflowReadiness">;
  orchestrationError?: string;
  projectOptions: AutomationProjectOption[];
  legacyCompilerEnabled: boolean;
  routeDetailForThread?: (thread: AutomationThreadSummary) => string | undefined;
  selectedFolder?: AutomationFolderSummary;
  selectedTaskProjectPath: string;
  tooltips: AutomationsLocalTaskPaneTooltips;
  visibleTaskRuns: OrchestrationRun[];
  visibleTasks: OrchestrationTask[];
  visibleThreads: AutomationThreadSummary[];
  taskById: Map<string, OrchestrationTask>;
  localTaskController: AutomationsLocalTaskControllerForRenderers;
  onCreateProject: () => void | Promise<void>;
  onOpenRunThread: (threadId: string) => void | Promise<void>;
  onOpenThread: (thread: AutomationThreadSummary) => void;
  onProjectPathChange: (path: string) => void;
  onRefresh: () => void | Promise<void>;
};

export function createAutomationsLocalTaskPaneRenderers(input: AutomationsLocalTaskPaneRenderersInput) {
  const { localTaskController } = input;

  function renderProjectField() {
    return (
      <AutomationProjectField
        projects={input.projectOptions}
        selectedPath={input.selectedTaskProjectPath}
        tooltip={input.tooltips.project}
        onProjectPathChange={input.onProjectPathChange}
        onCreateProject={input.onCreateProject}
      />
    );
  }

  function renderAutoDispatchStatus() {
    return <AutoDispatchStatusView status={input.autoDispatchStatus} workflowReadiness={input.orchestrationBoard?.workflowReadiness} />;
  }

  function renderAutoDispatchToggle() {
    return (
      <AutoDispatchToggle
        status={input.autoDispatchStatus}
        busy={localTaskController.autoDispatchBusy}
        tooltip={input.tooltips.autoDispatch}
        onChange={localTaskController.setAutoDispatch}
      />
    );
  }

  function renderPrepareResult() {
    return <PrepareResultView result={localTaskController.prepareResult} />;
  }

  function renderTaskRuns(runs: OrchestrationRun[], limit = 6) {
    return (
      <LocalTaskRunList
        runs={runs}
        limit={limit}
        taskById={input.taskById}
        startingRunId={localTaskController.startingRunId}
        cancelingRunId={localTaskController.cancelingRunId}
        onOpenRunThread={input.onOpenRunThread}
        onRevealWorkspace={localTaskController.revealOrchestrationWorkspace}
        onStartRun={localTaskController.startOrchestrationRun}
        onCancelRun={localTaskController.cancelOrchestrationRun}
        renderProofOfWorkPreview={(run) => <ProofOfWorkPreview run={run} />}
      />
    );
  }

  function renderLocalTaskBoard(tasks: OrchestrationTask[]) {
    return (
      <LocalTaskBoard
        loaded={Boolean(input.orchestrationBoard)}
        tasks={tasks}
        runs={input.orchestrationBoard?.runs ?? []}
        draggingTaskId={localTaskController.draggingTaskId}
        taskEditId={localTaskController.taskEditId}
        taskEditTitle={localTaskController.taskEditTitle}
        taskEditDescription={localTaskController.taskEditDescription}
        taskEditBusyId={localTaskController.taskEditBusyId}
        taskBlockerDrafts={localTaskController.taskBlockerDrafts}
        onAllowTaskDrop={localTaskController.allowTaskDrop}
        onDropTaskOnState={(event, state) => localTaskController.dropTaskOnState(event, state, input.orchestrationBoard?.tasks ?? [])}
        onStartTaskDrag={localTaskController.startTaskDrag}
        onTaskDragEnd={localTaskController.endTaskDrag}
        onUpdateTaskState={localTaskController.updateTaskState}
        onTaskEditTitleChange={localTaskController.setTaskEditTitle}
        onTaskEditDescriptionChange={localTaskController.setTaskEditDescription}
        onSaveTaskEdit={localTaskController.saveTaskEdit}
        onCancelTaskEdit={localTaskController.cancelTaskEdit}
        onStartTaskEdit={localTaskController.startTaskEdit}
        onUpdateTaskPriority={localTaskController.updateTaskPriority}
        onUpdateTaskLabels={localTaskController.updateTaskLabels}
        onUpdateTaskBlockers={localTaskController.updateTaskBlockers}
        onSetTaskBlockerDraft={localTaskController.setTaskBlockerDraft}
        onClearTaskBlockerDraft={localTaskController.clearTaskBlockerDraft}
        onOpenRunThread={input.onOpenRunThread}
        onRevealWorkspace={localTaskController.revealOrchestrationWorkspace}
      />
    );
  }

  function renderLocalTasksPane() {
    return (
      <LocalTasksPane
        tooltips={{
          localTasks: input.tooltips.localTasks,
          autoDispatch: input.tooltips.autoDispatch,
          triggerMode: input.tooltips.triggerMode,
          schedules: input.tooltips.schedules,
          recentRuns: input.tooltips.recentRuns,
        }}
        projectField={renderProjectField()}
        autoDispatchToggle={renderAutoDispatchToggle()}
        autoDispatchStatus={renderAutoDispatchStatus()}
        prepareResult={renderPrepareResult()}
        recentRuns={renderTaskRuns(input.visibleTaskRuns, 5)}
        taskBoard={renderLocalTaskBoard(input.visibleTasks)}
        taskTriggerMode={localTaskController.taskTriggerMode}
        taskInitialState={localTaskController.taskInitialState}
        taskSchedulePreset={localTaskController.taskSchedulePreset}
        taskScheduleExpression={localTaskController.taskScheduleExpression}
        taskTitle={localTaskController.taskTitle}
        taskDescription={localTaskController.taskDescription}
        taskPriority={localTaskController.taskPriority}
        taskLabels={localTaskController.taskLabels}
        prepareBusy={localTaskController.prepareBusy}
        taskBusy={localTaskController.taskBusy}
        orchestrationError={input.orchestrationError}
        onRefresh={input.onRefresh}
        onPrepareNext={localTaskController.prepareNextTasks}
        onCreateTask={() => localTaskController.createTask(input.selectedTaskProjectPath)}
        onTaskTriggerModeChange={localTaskController.setTaskTriggerMode}
        onTaskInitialStateChange={localTaskController.setTaskInitialState}
        onTaskSchedulePresetChange={localTaskController.setTaskSchedulePreset}
        onTaskScheduleExpressionChange={localTaskController.setTaskScheduleExpression}
        onTaskTitleChange={localTaskController.setTaskTitle}
        onTaskDescriptionChange={localTaskController.setTaskDescription}
        onTaskPriorityChange={localTaskController.setTaskPriority}
        onTaskLabelsChange={localTaskController.setTaskLabels}
      />
    );
  }

  function renderFolderPane() {
    const folderName = input.selectedFolder?.name ?? "Folder";
    return (
      <AutomationFolderPane
        folderName={folderName}
        legacyCompilerEnabled={input.legacyCompilerEnabled}
        localTasksTooltip={input.tooltips.localTasks}
        threads={input.visibleThreads}
        taskBoard={renderLocalTaskBoard(input.visibleTasks)}
        routeDetailForThread={input.routeDetailForThread}
        onOpenThread={input.onOpenThread}
      />
    );
  }

  return {
    renderAutoDispatchStatus,
    renderAutoDispatchToggle,
    renderFolderPane,
    renderLocalTaskBoard,
    renderLocalTasksPane,
    renderPrepareResult,
    renderProjectField,
    renderTaskRuns,
  };
}
