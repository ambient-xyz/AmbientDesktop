import { describe, expect, it } from "vitest";

import type { AutomationFolderSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { OrchestrationBoard, OrchestrationRun, OrchestrationTask, WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowDashboard, WorkflowRunDetail, WorkflowRunSummary } from "../../shared/workflowTypes";
import {
  automationWorkspaceSelectionModel,
  automationWorkspaceThreadForArtifact,
} from "./automationWorkspaceSelectionModel";

describe("automationWorkspaceSelectionModel", () => {
  it("derives visible threads, tasks, artifacts, runs, and route lookup for active panes", () => {
    const taskThread = automationThread({ id: "thread-task", kind: "orchestration_task", sourceId: "task-1", title: "Local task" });
    const artifactThread = automationThread({
      id: "thread-workflow",
      kind: "workflow_artifact",
      sourceId: "artifact-1",
      title: "Workflow artifact",
      latestRun: { id: "run-latest", status: "completed", startedAt: "2026-06-14T10:00:00Z", updatedAt: "2026-06-14T10:01:00Z" },
    });
    const folders = [automationFolder({ id: "home", threads: [taskThread, artifactThread] })];
    const workflowThread = workflowAgentThread({ id: "workflow-thread-1", activeArtifactId: "artifact-1", title: "Workflow thread" });
    const workflowDashboard = workflowDashboardFixture([workflowArtifact({ id: "artifact-1", workflowThreadId: "workflow-thread-1" })]);
    const orchestrationBoard = orchestrationBoardFixture([orchestrationTask({ id: "task-1" })], [orchestrationRun({ id: "run-1", taskId: "task-1" })]);

    const localTasks = automationWorkspaceSelectionModel({
      folders,
      activePane: "local_tasks",
      orchestrationBoard,
      workflowDashboard,
      workflowAgentFolders: [workflowAgentFolder({ threads: [workflowThread] })],
    });
    expect(localTasks.visibleThreads.map((thread) => thread.id)).toEqual(["thread-task"]);
    expect(localTasks.visibleTasks.map((task) => task.id)).toEqual(["task-1"]);
    expect(localTasks.visibleTaskRuns.map((run) => run.id)).toEqual(["run-1"]);
    expect(localTasks.visibleArtifacts).toEqual([]);
    expect(localTasks.taskById.get("task-1")?.title).toBe("Task task-1");

    const workflowPane = automationWorkspaceSelectionModel({
      folders,
      activePane: "workflow_agent",
      orchestrationBoard,
      workflowDashboard,
      workflowAgentFolders: [workflowAgentFolder({ threads: [workflowThread] })],
    });
    expect(workflowPane.visibleThreads.map((thread) => thread.id)).toEqual(["thread-workflow"]);
    expect(workflowPane.visibleArtifacts.map((artifact) => artifact.id)).toEqual(["artifact-1"]);
    expect(workflowPane.artifactById.get("artifact-1")?.title).toBe("Artifact artifact-1");
    expect(automationWorkspaceThreadForArtifact(workflowPane, workflowPane.artifactById.get("artifact-1"))?.id).toBe("workflow-thread-1");
  });

  it("prioritizes selected thread detail and selected Workflow Agent state", () => {
    const taskThread = automationThread({ id: "thread-task", kind: "orchestration_task", sourceId: "task-1" });
    const artifactThread = automationThread({ id: "thread-workflow", kind: "workflow_artifact", sourceId: "artifact-1" });
    const selectedRun = workflowRun({ id: "workflow-run-1", artifactId: "artifact-1" });
    const selectedArtifact = workflowArtifact({ id: "artifact-1", workflowThreadId: "workflow-thread-1" });
    const selectedThread = workflowAgentThread({
      id: "workflow-thread-1",
      activeArtifactId: "artifact-1",
      graph: {
        id: "graph-1",
        workflowThreadId: "workflow-thread-1",
        version: 1,
        source: "compile",
        nodes: [{ id: "node-1", label: "Open browser", type: "model_call" }],
        edges: [],
        summary: "Compiled graph",
        createdAt: "2026-06-14T00:00:00Z",
      },
    });
    const detail = workflowRunDetail(selectedArtifact, selectedRun);
    const model = automationWorkspaceSelectionModel({
      folders: [automationFolder({ id: "home", threads: [taskThread, artifactThread] })],
      selectedThread: artifactThread,
      activePane: "local_tasks",
      orchestrationBoard: orchestrationBoardFixture([orchestrationTask({ id: "task-1" })], []),
      workflowDashboard: workflowDashboardFixture([selectedArtifact], [selectedRun]),
      selectedWorkflowAgentThread: selectedThread,
      workflowDetail: detail,
      selectedWorkflowGraphNodeId: "node-1",
      workflowAgentFolders: [workflowAgentFolder({ threads: [selectedThread] })],
    });

    expect(model.visibleThreads.map((thread) => thread.id)).toEqual(["thread-workflow"]);
    expect(model.selectedArtifact?.id).toBe("artifact-1");
    expect(model.selectedTask).toBeUndefined();
    expect(model.selectedWorkflowAgentArtifact?.id).toBe("artifact-1");
    expect(model.selectedWorkflowAgentDetail?.run.id).toBe("workflow-run-1");
    expect(model.selectedWorkflowAgentSourceNode?.id).toBe("node-1");
    expect(model.selectedAutomationRun).toBe(artifactThread.latestRun);
    expect(model.selectedArtifactWorkflowThread?.id).toBe("workflow-thread-1");
    expect(model.selectedArtifactThreadRoute).toMatchObject({
      kind: "workflow_thread",
      workflowThreadId: "workflow-thread-1",
      disabled: false,
    });
  });

  it("falls back to active artifact id when a workflow artifact has no thread link", () => {
    const artifactThread = automationThread({ kind: "workflow_artifact", sourceId: "artifact-1" });
    const artifact = workflowArtifact({ id: "artifact-1", workflowThreadId: undefined });
    const workflowThread = workflowAgentThread({ id: "workflow-thread-1", activeArtifactId: "artifact-1" });
    const model = automationWorkspaceSelectionModel({
      folders: [automationFolder({ threads: [artifactThread] })],
      selectedThread: artifactThread,
      activePane: "home",
      workflowDashboard: workflowDashboardFixture([artifact]),
      workflowAgentFolders: [workflowAgentFolder({ threads: [workflowThread] })],
    });

    expect(model.selectedArtifactWorkflowThread?.id).toBe("workflow-thread-1");
    expect(automationWorkspaceThreadForArtifact(model, undefined, "artifact-1")?.id).toBe("workflow-thread-1");
  });
});

function automationFolder(overrides: Partial<AutomationFolderSummary> = {}): AutomationFolderSummary {
  return {
    id: "folder-1",
    name: "Home",
    kind: "home",
    createdAt: "2026-06-14T00:00:00Z",
    updatedAt: "2026-06-14T00:00:00Z",
    threads: [],
    ...overrides,
  };
}

function automationThread(overrides: Partial<AutomationThreadSummary> = {}): AutomationThreadSummary {
  return {
    id: "thread-1",
    folderId: "folder-1",
    kind: "orchestration_task",
    sourceId: "task-1",
    title: "Thread",
    preview: "Thread preview",
    status: "completed",
    projectName: "Project",
    projectPath: "/workspace/project",
    createdAt: "2026-06-14T00:00:00Z",
    updatedAt: "2026-06-14T00:00:00Z",
    badges: [],
    ...overrides,
  };
}

function orchestrationTask(overrides: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "TASK-1",
    title: `Task ${overrides.id ?? "task-1"}`,
    state: "todo",
    labels: [],
    blockedBy: [],
    sourceKind: "manual",
    createdAt: "2026-06-14T00:00:00Z",
    updatedAt: "2026-06-14T00:00:00Z",
    ...overrides,
  };
}

function orchestrationRun(overrides: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: "run-1",
    taskId: "task-1",
    attemptNumber: 1,
    status: "completed",
    workspacePath: "/workspace/project",
    startedAt: "2026-06-14T00:00:00Z",
    ...overrides,
  };
}

function orchestrationBoardFixture(tasks: OrchestrationTask[], runs: OrchestrationRun[]): OrchestrationBoard {
  return { tasks, runs };
}

function workflowArtifact(overrides: Partial<WorkflowArtifactSummary> = {}): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "workflow-thread-1",
    title: `Artifact ${overrides.id ?? "artifact-1"}`,
    summary: "Artifact summary",
    status: "approved",
    createdAt: "2026-06-14T00:00:00Z",
    updatedAt: "2026-06-14T00:00:00Z",
    sourcePath: "/workspace/project/WORKFLOW.md",
    manifest: { name: "Workflow", version: "1.0.0", triggers: [], steps: [] },
    spec: { version: "1.0", steps: [] },
    ...overrides,
  } as WorkflowArtifactSummary;
}

function workflowRun(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: "workflow-run-1",
    artifactId: "artifact-1",
    status: "completed",
    startedAt: "2026-06-14T00:00:00Z",
    updatedAt: "2026-06-14T00:01:00Z",
    ...overrides,
  } as WorkflowRunSummary;
}

function workflowDashboardFixture(artifacts: WorkflowArtifactSummary[], runs: WorkflowRunSummary[] = []): WorkflowDashboard {
  return { artifacts, runs };
}

function workflowAgentThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "workflow-folder-1",
    title: "Workflow thread",
    preview: "Workflow thread preview",
    initialRequest: "Do the work",
    phase: "approved",
    status: "approved",
    projectPath: "/workspace/project",
    createdAt: "2026-06-14T00:00:00Z",
    updatedAt: "2026-06-14T00:00:00Z",
    discoveryQuestions: [],
    graph: { nodes: [], edges: [] },
    ...overrides,
  } as WorkflowAgentThreadSummary;
}

function workflowAgentFolder(overrides: Partial<WorkflowAgentFolderSummary> = {}): WorkflowAgentFolderSummary {
  return {
    id: "workflow-folder-1",
    name: "Workflow",
    kind: "home",
    createdAt: "2026-06-14T00:00:00Z",
    updatedAt: "2026-06-14T00:00:00Z",
    threads: [],
    ...overrides,
  };
}

function workflowRunDetail(artifact: WorkflowArtifactSummary, run: WorkflowRunSummary): WorkflowRunDetail {
  return {
    artifact,
    run,
    events: [],
    modelCalls: [],
    checkpoints: [],
    approvals: [],
    auditReport: "Audit report",
  } as WorkflowRunDetail;
}
