import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";

import type { OrchestrationRun, OrchestrationTask } from "../../shared/types";
import {
  appendLocalTaskBlocker,
  latestRunForTask,
  localTaskCreateActionState,
  localTaskBlockerLabels,
  localTaskBlockerOptions,
  localTaskEditActionState,
  removeLocalTaskBlocker,
  sanitizeLocalTaskPriorityInput,
  stepLocalTaskPriority,
  triggerPreviewLabel,
  type AutomationSchedulePreset,
  type AutomationTriggerMode,
} from "./automationUiModel";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { AutomationExplainer } from "./AutomationsWorkflowUtilityViews";
import { formatTaskState, InfoTooltip } from "./RightPanel";

export const taskPrimaryStateOptions = ["todo", "ready", "in_progress", "review", "done", "canceled"];

export const taskPauseStateOptions = ["needs_info", "needs_review", "budget_exhausted", "terminal_blocker"];

export const taskStateOptions = [...taskPrimaryStateOptions, ...taskPauseStateOptions];

export function taskTriggerLabel(task: OrchestrationTask): string {
  const trigger = task.labels.find((label) => label.startsWith("trigger:"));
  if (!trigger) return "Manual";
  if (trigger === "trigger:auto-dispatch") return "Auto-dispatch";
  if (trigger === "trigger:scheduled") {
    const schedule = task.labels.find((label) => label.startsWith("schedule:"))?.slice("schedule:".length);
    return schedule ? `Scheduled ${formatTaskState(schedule)}` : "Scheduled";
  }
  return formatTaskState(trigger.slice("trigger:".length));
}

export function taskUserLabels(labels: string[]): string[] {
  return labels.filter((label) => !label.startsWith("trigger:") && !label.startsWith("schedule:"));
}

export function compareKanbanTasks(left: OrchestrationTask, right: OrchestrationTask): number {
  const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function taskPreviousState(state: string): string | undefined {
  const index = taskPrimaryStateOptions.indexOf(state);
  return index > 0 ? taskPrimaryStateOptions[index - 1] : undefined;
}

export function taskNextState(state: string): string | undefined {
  const index = taskPrimaryStateOptions.indexOf(state);
  return index >= 0 && index < taskPrimaryStateOptions.length - 1 ? taskPrimaryStateOptions[index + 1] : undefined;
}

export type LocalTaskBoardProps = {
  loaded: boolean;
  tasks: OrchestrationTask[];
  runs: OrchestrationRun[];
  draggingTaskId?: string;
  taskEditId?: string;
  taskEditTitle: string;
  taskEditDescription: string;
  taskEditBusyId?: string;
  taskBlockerDrafts: Record<string, string>;
  onAllowTaskDrop: (event: ReactDragEvent<HTMLElement>) => void;
  onDropTaskOnState: (event: ReactDragEvent<HTMLElement>, state: string) => void;
  onStartTaskDrag: (event: ReactDragEvent<HTMLElement>, task: OrchestrationTask) => void;
  onTaskDragEnd: () => void;
  onUpdateTaskState: (taskId: string, state: string) => void | Promise<void>;
  onTaskEditTitleChange: (value: string) => void;
  onTaskEditDescriptionChange: (value: string) => void;
  onSaveTaskEdit: (task: OrchestrationTask) => void | Promise<void>;
  onCancelTaskEdit: () => void;
  onStartTaskEdit: (task: OrchestrationTask) => void;
  onUpdateTaskPriority: (taskId: string, priority: number | null) => void | Promise<void>;
  onUpdateTaskLabels: (taskId: string, labels: string[]) => void | Promise<void>;
  onUpdateTaskBlockers: (taskId: string, blockers: string[]) => void | Promise<void>;
  onSetTaskBlockerDraft: (taskId: string, blockerRef: string) => void;
  onClearTaskBlockerDraft: (taskId: string) => void;
  onOpenRunThread: (threadId: string) => void | Promise<void>;
  onRevealWorkspace: (workspacePath: string) => void | Promise<void>;
};

export type LocalTasksPaneTooltips = {
  localTasks: string;
  autoDispatch: string;
  triggerMode: string;
  schedules: string;
  recentRuns: string;
};

export type LocalTasksPaneProps = {
  tooltips: LocalTasksPaneTooltips;
  projectField: ReactNode;
  autoDispatchToggle: ReactNode;
  autoDispatchStatus: ReactNode;
  prepareResult: ReactNode;
  recentRuns: ReactNode;
  taskBoard: ReactNode;
  taskTriggerMode: AutomationTriggerMode;
  taskInitialState: string;
  taskSchedulePreset: AutomationSchedulePreset;
  taskScheduleExpression: string;
  taskTitle: string;
  taskDescription: string;
  taskPriority: string;
  taskLabels: string;
  prepareBusy: boolean;
  taskBusy: boolean;
  orchestrationError?: string;
  onRefresh: () => void | Promise<void>;
  onPrepareNext: () => void | Promise<void>;
  onCreateTask: () => void | Promise<void>;
  onTaskTriggerModeChange: (mode: AutomationTriggerMode) => void;
  onTaskInitialStateChange: (state: string) => void;
  onTaskSchedulePresetChange: (preset: AutomationSchedulePreset) => void;
  onTaskScheduleExpressionChange: (expression: string) => void;
  onTaskTitleChange: (title: string) => void;
  onTaskDescriptionChange: (description: string) => void;
  onTaskPriorityChange: (priority: string) => void;
  onTaskLabelsChange: (labels: string) => void;
};

export function LocalTasksPane({
  tooltips,
  projectField,
  autoDispatchToggle,
  autoDispatchStatus,
  prepareResult,
  recentRuns,
  taskBoard,
  taskTriggerMode,
  taskInitialState,
  taskSchedulePreset,
  taskScheduleExpression,
  taskTitle,
  taskDescription,
  taskPriority,
  taskLabels,
  prepareBusy,
  taskBusy,
  orchestrationError,
  onRefresh,
  onPrepareNext,
  onCreateTask,
  onTaskTriggerModeChange,
  onTaskInitialStateChange,
  onTaskSchedulePresetChange,
  onTaskScheduleExpressionChange,
  onTaskTitleChange,
  onTaskDescriptionChange,
  onTaskPriorityChange,
  onTaskLabelsChange,
}: LocalTasksPaneProps) {
  const createAction = localTaskCreateActionState({ title: taskTitle, priorityInput: taskPriority, busy: taskBusy });
  return (
    <div className="automation-pane-shell">
      <AutomationExplainer
        paragraphs={[
          "Local Tasks are queued jobs for the normal Ambient coding agent. When a task runs, Ambient prepares a workspace from the selected project's workflow settings, opens a normal run chat, and sends the task as the agent prompt.",
          "Use Local Tasks for implementation work, investigations, refactors, and other project-specific coding-agent jobs. Choose the trigger intent up front so queued work is easier to scan later.",
        ]}
      />
      <section className="automation-section">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip={tooltips.localTasks}>Local Tasks</AutomationHeadingLabel>
          <div className="task-heading-actions">
            <button type="button" className="panel-button mini" title="Reload local task state, auto-dispatch status, and recent runs." onClick={() => void onRefresh()}>
              Refresh
            </button>
            {autoDispatchToggle}
            <InfoTooltip text={tooltips.autoDispatch} className="heading-info-tooltip" />
            <button type="button" className="panel-button mini" title="Prepare the next eligible task runs without starting them manually." disabled={prepareBusy} onClick={() => void onPrepareNext()}>
              {prepareBusy ? "Preparing" : "Prepare next"}
            </button>
          </div>
        </div>
        {autoDispatchStatus}
        <div className="automation-controls-grid">
          {projectField}
          <label className="automation-field">
            <span>
              <strong>Trigger</strong>
              <InfoTooltip text={tooltips.triggerMode} className="heading-info-tooltip" />
            </span>
            <select className="automation-select" value={taskTriggerMode} onChange={(event) => onTaskTriggerModeChange(event.target.value as AutomationTriggerMode)}>
              <option value="manual">Manual</option>
              <option value="auto_dispatch">Auto-dispatch</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </label>
          <label className="automation-field">
            <span>
              <strong>Initial state</strong>
              <InfoTooltip text="Ready tasks are eligible for preparation; todo tasks remain queued until promoted." className="heading-info-tooltip" />
            </span>
            <select className="automation-select" value={taskInitialState} onChange={(event) => onTaskInitialStateChange(event.target.value)}>
              {taskStateOptions.map((state) => (
                <option key={state} value={state}>
                  {formatTaskState(state)}
                </option>
              ))}
            </select>
          </label>
          {taskTriggerMode === "scheduled" && (
            <>
              <label className="automation-field">
                <span>
                  <strong>Schedule</strong>
                  <InfoTooltip text={tooltips.schedules} className="heading-info-tooltip" />
                </span>
                <select className="automation-select" value={taskSchedulePreset} onChange={(event) => onTaskSchedulePresetChange(event.target.value as AutomationSchedulePreset)}>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                  <option value="advanced">Advanced cron</option>
                </select>
              </label>
              {taskSchedulePreset === "advanced" && (
                <label className="automation-field">
                  <span>
                    <strong>Cron</strong>
                    <InfoTooltip text="Cron-like schedule expression stored with this task's trigger intent." className="heading-info-tooltip" />
                  </span>
                  <input className="panel-input" value={taskScheduleExpression} onChange={(event) => onTaskScheduleExpressionChange(event.target.value)} placeholder="0 9 * * *" />
                </label>
              )}
            </>
          )}
          <label className="automation-field wide">
            <span>
              <strong>Title</strong>
            </span>
            <input className="panel-input" value={taskTitle} onChange={(event) => onTaskTitleChange(event.target.value)} placeholder="Task title" maxLength={240} />
          </label>
          <label className="automation-field wide">
            <span>
              <strong>Description</strong>
            </span>
            <textarea className="panel-textarea" value={taskDescription} onChange={(event) => onTaskDescriptionChange(event.target.value)} placeholder="Description" rows={3} />
          </label>
          <label className="automation-field">
            <span>
              <strong>Priority</strong>
            </span>
            <div className="priority-control-row">
              <input
                className="panel-input"
                type="number"
                min={0}
                max={999}
                step={1}
                value={taskPriority}
                onChange={(event) => onTaskPriorityChange(sanitizeLocalTaskPriorityInput(event.target.value))}
                placeholder="Normal"
                inputMode="numeric"
                maxLength={3}
              />
              <small>Lower numbers run first; blank uses normal queue order.</small>
            </div>
          </label>
          <label className="automation-field">
            <span>
              <strong>Labels</strong>
            </span>
            <input className="panel-input" value={taskLabels} onChange={(event) => onTaskLabelsChange(event.target.value)} placeholder="Labels" maxLength={320} />
          </label>
        </div>
        <div className="task-heading-actions">
          <button type="button" className="panel-button" disabled={createAction.disabled} title={createAction.title} onClick={() => void onCreateTask()}>
            {createAction.label}
          </button>
          <span className="automation-trigger-preview">{triggerPreviewLabel(taskTriggerMode, taskSchedulePreset, taskScheduleExpression)}</span>
        </div>
        {orchestrationError ? <p className="panel-note">{orchestrationError}</p> : prepareResult}
        <section className="automation-section">
          <AutomationHeadingLabel tooltip={tooltips.recentRuns}>Recent Runs</AutomationHeadingLabel>
          {recentRuns}
        </section>
        {taskBoard}
      </section>
    </div>
  );
}

export function LocalTaskBoard({
  loaded,
  tasks,
  runs,
  draggingTaskId,
  taskEditId,
  taskEditTitle,
  taskEditDescription,
  taskEditBusyId,
  taskBlockerDrafts,
  onAllowTaskDrop,
  onDropTaskOnState,
  onStartTaskDrag,
  onTaskDragEnd,
  onUpdateTaskState,
  onTaskEditTitleChange,
  onTaskEditDescriptionChange,
  onSaveTaskEdit,
  onCancelTaskEdit,
  onStartTaskEdit,
  onUpdateTaskPriority,
  onUpdateTaskLabels,
  onUpdateTaskBlockers,
  onSetTaskBlockerDraft,
  onClearTaskBlockerDraft,
  onOpenRunThread,
  onRevealWorkspace,
}: LocalTaskBoardProps) {
  if (!loaded) return <p className="panel-note">Loading tasks...</p>;
  if (!tasks.length) return <p className="panel-note">No local tasks in this scope.</p>;
  const states = [
    ...taskPrimaryStateOptions,
    ...Array.from(new Set(tasks.map((task) => task.state).filter((state) => !taskPrimaryStateOptions.includes(state)))),
  ];
  const tasksByState = new Map(states.map((state) => [state, tasks.filter((task) => task.state === state).sort(compareKanbanTasks)]));
  return (
    <div className="task-kanban-board" aria-label="Local task Kanban board">
      {states.map((state) => {
        const columnTasks = tasksByState.get(state) ?? [];
        return (
          <section
            className={`task-kanban-column${draggingTaskId ? " drop-active" : ""}`}
            key={state}
            onDragEnter={onAllowTaskDrop}
            onDragOver={onAllowTaskDrop}
            onDrop={(event) => onDropTaskOnState(event, state)}
          >
            <div className="task-kanban-column-header">
              <strong>{formatTaskState(state)}</strong>
              <span>{columnTasks.length}</span>
            </div>
            <div className="task-kanban-column-body">
              {columnTasks.length === 0 ? (
                <p className="task-kanban-empty">No tasks</p>
              ) : (
                columnTasks.map((task) => {
                  const latestRun = latestRunForTask(runs, task.id);
                  const blocked = task.blockedBy.length > 0;
                  const userLabels = taskUserLabels(task.labels);
                  const blockerLabels = localTaskBlockerLabels(task.blockedBy, tasks);
                  const blockerOptions = localTaskBlockerOptions(task.id, task.blockedBy, tasks);
                  const draftBlockerRef = taskBlockerDrafts[task.id];
                  const selectedBlockerRef =
                    draftBlockerRef && blockerOptions.some((option) => option.value === draftBlockerRef) ? draftBlockerRef : (blockerOptions[0]?.value ?? "");
                  const selectedBlockerOption = blockerOptions.find((option) => option.value === selectedBlockerRef);
                  const selectedBlockerTitle = selectedBlockerOption?.fullLabel ?? selectedBlockerOption?.label ?? "Choose a dependency blocker";
                  const editing = taskEditId === task.id;
                  const editTitle = taskEditTitle.trim();
                  const editDescription = taskEditDescription.trim();
                  const editAction = localTaskEditActionState({
                    title: taskEditTitle,
                    dirty: editTitle !== task.title || editDescription !== (task.description ?? ""),
                    busy: taskEditBusyId === task.id,
                  });
                  return (
                    <section
                      className={`task-row task-kanban-card ${blocked ? "blocked" : ""}${draggingTaskId === task.id ? " dragging" : ""}`}
                      key={task.id}
                      draggable={!editing && !taskEditBusyId}
                      onDragStart={(event) => onStartTaskDrag(event, task)}
                      onDragEnd={onTaskDragEnd}
                      aria-label={`Kanban task ${task.identifier}: ${task.title}`}
                    >
                      <div className="task-row-header">
                        <strong>{task.identifier}</strong>
                        <div className="task-kanban-state-controls">
                          <button
                            type="button"
                            className="icon-button"
                            title={taskPreviousState(task.state) ? `Move to ${formatTaskState(taskPreviousState(task.state)!)}` : "No previous column"}
                            disabled={!taskPreviousState(task.state)}
                            onClick={() => {
                              const previous = taskPreviousState(task.state);
                              if (previous) void onUpdateTaskState(task.id, previous);
                            }}
                          >
                            <ChevronLeft size={13} />
                          </button>
                          <select value={task.state} onChange={(event) => void onUpdateTaskState(task.id, event.target.value)}>
                            {taskStateOptions.map((option) => (
                              <option key={option} value={option}>
                                {formatTaskState(option)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="icon-button"
                            title={taskNextState(task.state) ? `Move to ${formatTaskState(taskNextState(task.state)!)}` : "No next column"}
                            disabled={!taskNextState(task.state)}
                            onClick={() => {
                              const next = taskNextState(task.state);
                              if (next) void onUpdateTaskState(task.id, next);
                            }}
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                      {editing ? (
                        <div className="task-kanban-edit-form">
                          <label className="automation-field">
                            <span>
                              <strong>Title</strong>
                            </span>
                            <input
                              className="panel-input"
                              value={taskEditTitle}
                              onChange={(event) => onTaskEditTitleChange(event.target.value)}
                              placeholder="Edit task title"
                              title={taskEditTitle || "Edit task title"}
                              aria-label={`Title for ${task.identifier}`}
                              maxLength={240}
                            />
                          </label>
                          <label className="automation-field">
                            <span>
                              <strong>Description</strong>
                            </span>
                            <textarea
                              className="panel-textarea"
                              value={taskEditDescription}
                              onChange={(event) => onTaskEditDescriptionChange(event.target.value)}
                              placeholder="Edit task description"
                              maxLength={20_000}
                              rows={3}
                            />
                          </label>
                          <div className="task-row-actions">
                            <button type="button" className="panel-button mini" disabled={editAction.disabled} title={editAction.title} onClick={() => void onSaveTaskEdit(task)}>
                              {editAction.label}
                            </button>
                            <button type="button" className="panel-button mini" disabled={taskEditBusyId === task.id} onClick={onCancelTaskEdit}>
                              Cancel edit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3>{task.title}</h3>
                          {task.description && <p>{task.description}</p>}
                        </>
                      )}
                      <div className="plugin-badges">
                        <span>{taskTriggerLabel(task)}</span>
                        {task.priority !== undefined && <span>Priority {task.priority}</span>}
                        {blockerLabels.map((blocker) => (
                          <span key={blocker.value}>Blocked by {blocker.label}</span>
                        ))}
                        {task.workspacePath && <span>Workspace ready</span>}
                        {latestRun && <span>Latest {formatTaskState(latestRun.status)}</span>}
                        {userLabels.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                      <div className="task-row-actions">
                        {!editing && (
                          <button type="button" className="panel-button mini" disabled={Boolean(taskEditBusyId)} onClick={() => onStartTaskEdit(task)}>
                            Edit card
                          </button>
                        )}
                        {task.priority !== undefined && (
                          <>
                            <button
                              type="button"
                              className="panel-button mini"
                              disabled={task.priority <= 0 || Boolean(taskEditBusyId)}
                              onClick={() => void onUpdateTaskPriority(task.id, stepLocalTaskPriority(task.priority!, "higher"))}
                            >
                              Priority higher
                            </button>
                            <button
                              type="button"
                              className="panel-button mini"
                              disabled={task.priority >= 999 || Boolean(taskEditBusyId)}
                              onClick={() => void onUpdateTaskPriority(task.id, stepLocalTaskPriority(task.priority!, "lower"))}
                            >
                              Priority lower
                            </button>
                            <button type="button" className="panel-button mini" disabled={Boolean(taskEditBusyId)} onClick={() => void onUpdateTaskPriority(task.id, null)}>
                              Clear priority
                            </button>
                          </>
                        )}
                        {userLabels.map((label) => (
                          <button
                            type="button"
                            className="panel-button mini"
                            key={`${task.id}-${label}`}
                            disabled={Boolean(taskEditBusyId)}
                            onClick={() => void onUpdateTaskLabels(task.id, task.labels.filter((candidate) => candidate !== label))}
                          >
                            Remove label {label}
                          </button>
                        ))}
                        {blockerLabels.map((blocker) => (
                          <button
                            type="button"
                            className="panel-button mini"
                            key={`${task.id}-blocker-${blocker.value}`}
                            disabled={Boolean(taskEditBusyId)}
                            onClick={() => void onUpdateTaskBlockers(task.id, removeLocalTaskBlocker(task.blockedBy, blocker.value))}
                          >
                            Remove blocker {blocker.label}
                          </button>
                        ))}
                        {blockerOptions.length > 0 && (
                          <div className="task-kanban-blocker-control">
                            <select
                              aria-label={`Blocker for ${task.identifier}`}
                              title={selectedBlockerTitle}
                              value={selectedBlockerRef}
                              onChange={(event) => onSetTaskBlockerDraft(task.id, event.target.value)}
                            >
                              {blockerOptions.map((option) => (
                                <option key={option.value} value={option.value} title={option.fullLabel ?? option.label}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="panel-button mini"
                              disabled={!selectedBlockerRef || Boolean(taskEditBusyId)}
                              onClick={() => {
                                const nextBlockers = appendLocalTaskBlocker(task.blockedBy, selectedBlockerRef);
                                onClearTaskBlockerDraft(task.id);
                                void onUpdateTaskBlockers(task.id, nextBlockers);
                              }}
                            >
                              Add blocker
                            </button>
                          </div>
                        )}
                        {latestRun?.threadId && (
                          <button
                            type="button"
                            className="panel-button mini"
                            disabled={Boolean(taskEditBusyId)}
                            onClick={() => void onOpenRunThread(latestRun.threadId!)}
                          >
                            Open run chat
                          </button>
                        )}
                        {task.workspacePath && (
                          <button
                            type="button"
                            className="panel-button mini"
                            disabled={Boolean(taskEditBusyId)}
                            onClick={() => void onRevealWorkspace(task.workspacePath!)}
                          >
                            Reveal workspace
                          </button>
                        )}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
