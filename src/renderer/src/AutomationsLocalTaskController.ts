import type { DragEvent as ReactDragEvent } from "react";
import { useState } from "react";

import type { CreateOrchestrationTaskInput, OrchestrationAutoDispatchStatus, OrchestrationBoard, OrchestrationPrepareResult, OrchestrationTask, UpdateOrchestrationTaskInput } from "../../shared/workflowTypes";
import {
  localTaskEditActionState,
  parseLocalTaskLabels,
  parseLocalTaskPriority,
  taskTriggerLabels,
  type AutomationSchedulePreset,
  type AutomationTriggerMode,
} from "./automationUiModel";

export type LocalTaskCreateInputState = {
  title: string;
  description: string;
  priorityInput: string;
  labelsInput: string;
  initialState: string;
  triggerMode: AutomationTriggerMode;
  schedulePreset: AutomationSchedulePreset;
  scheduleExpression: string;
  projectPath?: string;
};

export type LocalTaskCreateInputResult =
  | { kind: "ready"; input: CreateOrchestrationTaskInput }
  | { kind: "error"; error: string }
  | { kind: "skip" };

export type LocalTaskEditInputResult =
  | { kind: "ready"; input: UpdateOrchestrationTaskInput }
  | { kind: "skip" };

export function localTaskCreateInput(state: LocalTaskCreateInputState): LocalTaskCreateInputResult {
  const title = state.title.trim();
  if (!title) return { kind: "skip" };
  const parsedPriority = parseLocalTaskPriority(state.priorityInput);
  if (parsedPriority.error) return { kind: "error", error: parsedPriority.error };
  return {
    kind: "ready",
    input: {
      title,
      description: state.description.trim() || undefined,
      state: state.initialState,
      priority: parsedPriority.priority,
      labels: [
        ...taskTriggerLabels(state.triggerMode, state.schedulePreset, state.scheduleExpression),
        ...parseLocalTaskLabels(state.labelsInput),
      ],
      projectPath: state.projectPath,
    },
  };
}

export function localTaskEditInput(
  task: Pick<OrchestrationTask, "id" | "title" | "description">,
  title: string,
  description: string,
  busy: boolean,
): LocalTaskEditInputResult {
  const nextTitle = title.trim();
  const nextDescription = description.trim();
  const editAction = localTaskEditActionState({
    title: nextTitle,
    dirty: nextTitle !== task.title || nextDescription !== (task.description ?? ""),
    busy,
  });
  if (editAction.disabled) return { kind: "skip" };
  return {
    kind: "ready",
    input: {
      id: task.id,
      title: nextTitle,
      description: nextDescription,
    },
  };
}

export function localTaskDropUpdateInput(
  tasks: Pick<OrchestrationTask, "id" | "state">[],
  taskId: string | undefined,
  state: string,
): UpdateOrchestrationTaskInput | undefined {
  if (!taskId) return undefined;
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.state === state) return undefined;
  return { id: task.id, state };
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAutomationsLocalTaskController({
  refreshAutomationFolders,
  loadAutoDispatchStatus,
  onOrchestrationBoardChanged,
  onOrchestrationErrorChanged,
  onAutoDispatchStatusChanged,
}: {
  refreshAutomationFolders: () => Promise<unknown>;
  loadAutoDispatchStatus: () => Promise<unknown>;
  onOrchestrationBoardChanged: (board: OrchestrationBoard) => void;
  onOrchestrationErrorChanged: (message: string | undefined) => void;
  onAutoDispatchStatusChanged: (status: OrchestrationAutoDispatchStatus) => void;
}) {
  const [autoDispatchBusy, setAutoDispatchBusy] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("");
  const [taskLabels, setTaskLabels] = useState("");
  const [taskInitialState, setTaskInitialState] = useState("todo");
  const [taskTriggerMode, setTaskTriggerMode] = useState<AutomationTriggerMode>("manual");
  const [taskSchedulePreset, setTaskSchedulePreset] = useState<AutomationSchedulePreset>("daily");
  const [taskScheduleExpression, setTaskScheduleExpression] = useState("0 9 * * *");
  const [taskEditId, setTaskEditId] = useState<string | undefined>();
  const [taskEditTitle, setTaskEditTitle] = useState("");
  const [taskEditDescription, setTaskEditDescription] = useState("");
  const [taskEditBusyId, setTaskEditBusyId] = useState<string | undefined>();
  const [taskBlockerDrafts, setTaskBlockerDrafts] = useState<Record<string, string>>({});
  const [draggingTaskId, setDraggingTaskId] = useState<string | undefined>();
  const [taskBusy, setTaskBusy] = useState(false);
  const [prepareBusy, setPrepareBusy] = useState(false);
  const [prepareResult, setPrepareResult] = useState<OrchestrationPrepareResult | undefined>();
  const [startingRunId, setStartingRunId] = useState<string | undefined>();
  const [cancelingRunId, setCancelingRunId] = useState<string | undefined>();

  async function updateTask(input: UpdateOrchestrationTaskInput) {
    onOrchestrationErrorChanged(undefined);
    try {
      onOrchestrationBoardChanged(await window.ambientDesktop.updateOrchestrationTask(input));
      await refreshAutomationFolders();
    } catch (error) {
      onOrchestrationErrorChanged(messageForError(error));
    }
  }

  async function setAutoDispatch(enabled: boolean) {
    setAutoDispatchBusy(true);
    onOrchestrationErrorChanged(undefined);
    try {
      onAutoDispatchStatusChanged(await window.ambientDesktop.setOrchestrationAutoDispatchEnabled({ enabled }));
      onOrchestrationBoardChanged(await window.ambientDesktop.listOrchestrationBoard());
      await refreshAutomationFolders();
    } catch (error) {
      onOrchestrationErrorChanged(messageForError(error));
      await loadAutoDispatchStatus();
    } finally {
      setAutoDispatchBusy(false);
    }
  }

  async function createTask(projectPath?: string) {
    const result = localTaskCreateInput({
      title: taskTitle,
      description: taskDescription,
      priorityInput: taskPriority,
      labelsInput: taskLabels,
      initialState: taskInitialState,
      triggerMode: taskTriggerMode,
      schedulePreset: taskSchedulePreset,
      scheduleExpression: taskScheduleExpression,
      projectPath,
    });
    if (result.kind === "skip") return;
    if (result.kind === "error") {
      onOrchestrationErrorChanged(result.error);
      return;
    }
    setTaskBusy(true);
    onOrchestrationErrorChanged(undefined);
    try {
      onOrchestrationBoardChanged(await window.ambientDesktop.createOrchestrationTask(result.input));
      setTaskTitle("");
      setTaskDescription("");
      setTaskPriority("");
      setTaskLabels("");
      setTaskInitialState("todo");
      setTaskTriggerMode("manual");
      await refreshAutomationFolders();
    } catch (error) {
      onOrchestrationErrorChanged(messageForError(error));
    } finally {
      setTaskBusy(false);
    }
  }

  function startTaskDrag(event: ReactDragEvent<HTMLElement>, task: OrchestrationTask) {
    if (taskEditBusyId || taskEditId === task.id) {
      event.preventDefault();
      return;
    }
    setDraggingTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    event.dataTransfer.setData("application/x-ambient-task-id", task.id);
  }

  function allowTaskDrop(event: ReactDragEvent<HTMLElement>) {
    if (!draggingTaskId && !event.dataTransfer.types.includes("application/x-ambient-task-id")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function dropTaskOnState(event: ReactDragEvent<HTMLElement>, state: string, tasks: OrchestrationTask[]) {
    const taskId = event.dataTransfer.getData("application/x-ambient-task-id") || event.dataTransfer.getData("text/plain") || draggingTaskId;
    const updateInput = localTaskDropUpdateInput(tasks, taskId, state);
    if (!updateInput) return;
    event.preventDefault();
    setDraggingTaskId(undefined);
    void updateTask(updateInput);
  }

  function setTaskBlockerDraft(taskId: string, blockerRef: string) {
    setTaskBlockerDrafts((current) => ({ ...current, [taskId]: blockerRef }));
  }

  function clearTaskBlockerDraft(taskId: string) {
    setTaskBlockerDrafts((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function startTaskEdit(task: OrchestrationTask) {
    setTaskEditId(task.id);
    setTaskEditTitle(task.title);
    setTaskEditDescription(task.description ?? "");
    onOrchestrationErrorChanged(undefined);
  }

  function cancelTaskEdit() {
    setTaskEditId(undefined);
    setTaskEditTitle("");
    setTaskEditDescription("");
  }

  async function saveTaskEdit(task: OrchestrationTask) {
    const result = localTaskEditInput(task, taskEditTitle, taskEditDescription, taskEditBusyId === task.id);
    if (result.kind === "skip") return;
    setTaskEditBusyId(task.id);
    onOrchestrationErrorChanged(undefined);
    try {
      onOrchestrationBoardChanged(await window.ambientDesktop.updateOrchestrationTask(result.input));
      cancelTaskEdit();
      await refreshAutomationFolders();
    } catch (error) {
      onOrchestrationErrorChanged(messageForError(error));
    } finally {
      setTaskEditBusyId(undefined);
    }
  }

  async function prepareNextTasks() {
    setPrepareBusy(true);
    onOrchestrationErrorChanged(undefined);
    try {
      setPrepareResult(await window.ambientDesktop.prepareNextOrchestrationTasks());
      onOrchestrationBoardChanged(await window.ambientDesktop.listOrchestrationBoard());
      await refreshAutomationFolders();
    } catch (error) {
      setPrepareResult(undefined);
      onOrchestrationErrorChanged(messageForError(error));
    } finally {
      setPrepareBusy(false);
    }
  }

  async function startOrchestrationRun(runId: string) {
    setStartingRunId(runId);
    onOrchestrationErrorChanged(undefined);
    try {
      onOrchestrationBoardChanged(await window.ambientDesktop.startOrchestrationRun({ runId }));
      await refreshAutomationFolders();
    } catch (error) {
      onOrchestrationErrorChanged(messageForError(error));
    } finally {
      setStartingRunId(undefined);
    }
  }

  async function cancelOrchestrationRun(runId: string) {
    setCancelingRunId(runId);
    onOrchestrationErrorChanged(undefined);
    try {
      onOrchestrationBoardChanged(await window.ambientDesktop.cancelOrchestrationRun({ runId }));
      await refreshAutomationFolders();
    } catch (error) {
      onOrchestrationErrorChanged(messageForError(error));
    } finally {
      setCancelingRunId(undefined);
    }
  }

  async function revealOrchestrationWorkspace(workspacePath: string) {
    onOrchestrationErrorChanged(undefined);
    try {
      await window.ambientDesktop.revealOrchestrationWorkspace({ workspacePath });
    } catch (error) {
      onOrchestrationErrorChanged(messageForError(error));
    }
  }

  return {
    autoDispatchBusy,
    setAutoDispatch,
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    taskPriority,
    setTaskPriority,
    taskLabels,
    setTaskLabels,
    taskInitialState,
    setTaskInitialState,
    taskTriggerMode,
    setTaskTriggerMode,
    taskSchedulePreset,
    setTaskSchedulePreset,
    taskScheduleExpression,
    setTaskScheduleExpression,
    taskEditId,
    taskEditTitle,
    setTaskEditTitle,
    taskEditDescription,
    setTaskEditDescription,
    taskEditBusyId,
    taskBlockerDrafts,
    setTaskBlockerDraft,
    clearTaskBlockerDraft,
    draggingTaskId,
    endTaskDrag: () => setDraggingTaskId(undefined),
    taskBusy,
    prepareBusy,
    prepareResult,
    startingRunId,
    cancelingRunId,
    createTask,
    updateTaskState: (id: string, state: string) => updateTask({ id, state }),
    startTaskDrag,
    allowTaskDrop,
    dropTaskOnState,
    updateTaskPriority: (id: string, priority: number | null) => updateTask({ id, priority }),
    updateTaskLabels: (id: string, labels: string[]) => updateTask({ id, labels }),
    updateTaskBlockers: (id: string, blockedBy: string[]) => updateTask({ id, blockedBy }),
    startTaskEdit,
    cancelTaskEdit,
    saveTaskEdit,
    prepareNextTasks,
    startOrchestrationRun,
    cancelOrchestrationRun,
    revealOrchestrationWorkspace,
  };
}
