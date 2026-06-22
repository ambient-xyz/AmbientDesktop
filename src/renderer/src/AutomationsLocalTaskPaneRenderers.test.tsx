import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { OrchestrationBoard, OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { LocalTaskBoard, LocalTasksPane } from "./AutomationsLocalTaskBoard";
import {
  createAutomationsLocalTaskPaneRenderers,
  type AutomationsLocalTaskControllerForRenderers,
  type AutomationsLocalTaskPaneRenderersInput,
} from "./AutomationsLocalTaskPaneRenderers";
import { AutoDispatchToggle, LocalTaskRunList } from "./AutomationsRunHistory";
import { AutomationProjectField } from "./AutomationsWorkspaceShellViews";

describe("createAutomationsLocalTaskPaneRenderers", () => {
  it("forwards project and auto-dispatch controls to the existing view components", () => {
    const input = baseInput();
    const renderers = createAutomationsLocalTaskPaneRenderers(input);

    const projectField = expectElement<Parameters<typeof AutomationProjectField>[0]>(
      renderers.renderProjectField(),
      AutomationProjectField,
    );
    expect(projectField.props.selectedPath).toBe("/workspace");
    projectField.props.onProjectPathChange("/next");
    expect(input.onProjectPathChange).toHaveBeenCalledWith("/next");

    const autoDispatchToggle = expectElement<Parameters<typeof AutoDispatchToggle>[0]>(
      renderers.renderAutoDispatchToggle(),
      AutoDispatchToggle,
    );
    expect(autoDispatchToggle.props.status).toBe(input.autoDispatchStatus);
    autoDispatchToggle.props.onChange(false);
    expect(input.localTaskController.setAutoDispatch).toHaveBeenCalledWith(false);
  });

  it("keeps local task pane state and create-task routing on the injected controller", () => {
    const input = baseInput();
    const renderers = createAutomationsLocalTaskPaneRenderers(input);

    const pane = expectElement<Parameters<typeof LocalTasksPane>[0]>(
      renderers.renderLocalTasksPane(),
      LocalTasksPane,
    );
    expect(pane.props.taskTitle).toBe("Implement refactor");
    expect(pane.props.taskTriggerMode).toBe("manual");
    pane.props.onCreateTask();
    expect(input.localTaskController.createTask).toHaveBeenCalledWith("/workspace");
  });

  it("keeps local task board drop context and run actions wired to the injected controller", () => {
    const task = taskFixture();
    const input = baseInput({
      orchestrationBoard: boardFixture({ tasks: [task], runs: [runFixture(task.id)] }),
      visibleTasks: [task],
    });
    const renderers = createAutomationsLocalTaskPaneRenderers(input);

    const board = expectElement<Parameters<typeof LocalTaskBoard>[0]>(
      renderers.renderLocalTaskBoard([task]),
      LocalTaskBoard,
    );
    const dragEvent = {} as Parameters<typeof board.props.onDropTaskOnState>[0];
    board.props.onDropTaskOnState(dragEvent, "done");
    expect(input.localTaskController.dropTaskOnState).toHaveBeenCalledWith(dragEvent, "done", [task]);

    const runList = expectElement<Parameters<typeof LocalTaskRunList>[0]>(
      renderers.renderTaskRuns([runFixture(task.id)], 8),
      LocalTaskRunList,
    );
    expect(runList.props.limit).toBe(8);
    runList.props.onStartRun("run-1");
    expect(input.localTaskController.startOrchestrationRun).toHaveBeenCalledWith("run-1");
  });
});

function expectElement<Props>(
  node: ReactNode,
  type: ReactElement<Props>["type"],
): ReactElement<Props> {
  expect(isValidElement(node)).toBe(true);
  const element = node as ReactElement<Props>;
  expect(element.type).toBe(type);
  return element;
}

function baseInput(
  overrides: Partial<AutomationsLocalTaskPaneRenderersInput> = {},
): AutomationsLocalTaskPaneRenderersInput {
  const task = taskFixture();
  const input = {
    autoDispatchStatus: {
      enabled: true,
      inFlight: false,
      lastStartedRunIds: [],
      lastStartedRuns: [],
      workflowAllows: true,
    } as unknown as AutomationsLocalTaskPaneRenderersInput["autoDispatchStatus"],
    orchestrationBoard: boardFixture({ tasks: [task], runs: [runFixture(task.id)] }),
    orchestrationError: undefined,
    projectOptions: [{ path: "/workspace", name: "Workspace" }],
    legacyCompilerEnabled: true,
    routeDetailForThread: vi.fn(() => "Route"),
    selectedFolder: {
      id: "folder-1",
      kind: "custom",
      name: "Folder",
      threads: [],
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    },
    selectedTaskProjectPath: "/workspace",
    tooltips: {
      project: "Project",
      autoDispatch: "Auto-dispatch",
      localTasks: "Local tasks",
      triggerMode: "Trigger mode",
      schedules: "Schedules",
      recentRuns: "Recent runs",
    },
    visibleTaskRuns: [runFixture(task.id)],
    visibleTasks: [task],
    visibleThreads: [],
    taskById: new Map([[task.id, task]]),
    localTaskController: controllerFixture(),
    onCreateProject: vi.fn(),
    onOpenRunThread: vi.fn(),
    onOpenThread: vi.fn(),
    onProjectPathChange: vi.fn(),
    onRefresh: vi.fn(),
  } satisfies AutomationsLocalTaskPaneRenderersInput;
  return {
    ...input,
    ...overrides,
  };
}

function controllerFixture(
  overrides: Partial<AutomationsLocalTaskControllerForRenderers> = {},
): AutomationsLocalTaskControllerForRenderers {
  return {
    allowTaskDrop: vi.fn(),
    autoDispatchBusy: false,
    cancelingRunId: undefined,
    cancelOrchestrationRun: vi.fn(),
    cancelTaskEdit: vi.fn(),
    clearTaskBlockerDraft: vi.fn(),
    createTask: vi.fn(),
    draggingTaskId: undefined,
    dropTaskOnState: vi.fn(),
    endTaskDrag: vi.fn(),
    prepareBusy: false,
    prepareNextTasks: vi.fn(),
    prepareResult: undefined,
    revealOrchestrationWorkspace: vi.fn(),
    saveTaskEdit: vi.fn(),
    setAutoDispatch: vi.fn(),
    setTaskBlockerDraft: vi.fn(),
    setTaskDescription: vi.fn(),
    setTaskEditDescription: vi.fn(),
    setTaskEditTitle: vi.fn(),
    setTaskInitialState: vi.fn(),
    setTaskLabels: vi.fn(),
    setTaskPriority: vi.fn(),
    setTaskScheduleExpression: vi.fn(),
    setTaskSchedulePreset: vi.fn(),
    setTaskTitle: vi.fn(),
    setTaskTriggerMode: vi.fn(),
    startOrchestrationRun: vi.fn(),
    startingRunId: undefined,
    startTaskDrag: vi.fn(),
    startTaskEdit: vi.fn(),
    taskBlockerDrafts: {},
    taskBusy: false,
    taskDescription: "Description",
    taskEditBusyId: undefined,
    taskEditDescription: "",
    taskEditId: undefined,
    taskEditTitle: "",
    taskInitialState: "todo",
    taskLabels: "",
    taskPriority: "",
    taskScheduleExpression: "0 9 * * *",
    taskSchedulePreset: "daily",
    taskTitle: "Implement refactor",
    taskTriggerMode: "manual",
    updateTaskBlockers: vi.fn(),
    updateTaskLabels: vi.fn(),
    updateTaskPriority: vi.fn(),
    updateTaskState: vi.fn(),
    ...overrides,
  };
}

function taskFixture(): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "TASK-1",
    title: "Task",
    state: "todo",
    labels: [],
    blockedBy: [],
    sourceKind: "manual",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
  } as unknown as OrchestrationTask;
}

function runFixture(taskId: string): OrchestrationRun {
  return {
    id: "run-1",
    taskId,
    status: "prepared",
    workspacePath: "/workspace",
    attemptNumber: 1,
    startedAt: "2026-06-22T00:00:00.000Z",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
  } as unknown as OrchestrationRun;
}

function boardFixture(input: { tasks: OrchestrationTask[]; runs: OrchestrationRun[] }): Pick<
  OrchestrationBoard,
  "runs" | "tasks" | "workflowReadiness"
> {
  return {
    tasks: input.tasks,
    runs: input.runs,
    workflowReadiness: { status: "ready", path: "/workspace/WORKFLOW.md" },
  } as Pick<OrchestrationBoard, "runs" | "tasks" | "workflowReadiness">;
}
