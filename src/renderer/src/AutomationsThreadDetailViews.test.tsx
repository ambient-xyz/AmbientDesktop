import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  AutomationFolderSummary,
  AutomationThreadSummary,
  OrchestrationRun,
  OrchestrationTask,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
} from "../../shared/types";
import { AutomationSelectedThreadDetailView } from "./AutomationsThreadDetailViews";
import type { WorkflowArtifactThreadRoute } from "./workflowThreadFirstUiModel";

describe("Automations thread detail views", () => {
  it("renders selected workflow and local task details without owning commands", () => {
    const markup = renderToStaticMarkup(
      <AutomationSelectedThreadDetailView
        selectedThread={automationThread()}
        folders={[folder({ id: "home", name: "Home" }), folder({ id: "custom", name: "Custom" })]}
        selectedAutomationRun={{
          id: "summary-run-1",
          status: "prepared",
          startedAt: "2026-06-14T10:00:00.000Z",
          updatedAt: "2026-06-14T10:01:00.000Z",
          threadId: "chat-thread-1",
          workspacePath: "/tmp/workspace",
        }}
        selectedArtifact={workflowArtifact()}
        selectedArtifactThreadRoute={workflowRoute()}
        selectedArtifactWorkflowThread={workflowThread({ phase: "approved" })}
        selectedTask={task()}
        visibleTaskRuns={[run({ id: "run-1", status: "prepared", threadId: "run-thread-1" })]}
        workflowAgentTooltip="Workflow tooltip"
        localTasksTooltip="Local task tooltip"
        recentRunsTooltip="Runs tooltip"
        onMoveThread={() => undefined}
        onOpenRunThread={() => undefined}
        onRevealWorkspace={() => undefined}
        onOpenWorkflowArtifactThread={() => undefined}
        onUpdateTaskState={() => undefined}
        onUpdateTaskLabels={() => undefined}
        onStartRun={() => undefined}
      />,
    );

    expect(markup).toContain("automation-detail-strip");
    expect(markup).toContain("Project Alpha");
    expect(markup).toContain("Open run chat");
    expect(markup).toContain("Reveal workspace");
    expect(markup).toContain("Workflow Agent Thread");
    expect(markup).toContain("Open Workflow Agent thread");
    expect(markup).toContain("Artifact workflow");
    expect(markup).toContain("Thread linked");
    expect(markup).toContain("Approved");
    expect(markup).toContain("Local Task");
    expect(markup).toContain("TASK-1");
    expect(markup).toContain("Implement detail extraction");
    expect(markup).toContain("Priority 2");
    expect(markup).toContain("frontend");
    expect(markup).toContain("Remove label user:frontend");
    expect(markup).toContain("Runs");
    expect(markup).toContain("Start");
    expect(markup).toContain("/tmp/run-workspace");
  });

  it("renders the selected local task empty run state", () => {
    const markup = renderToStaticMarkup(
      <AutomationSelectedThreadDetailView
        selectedThread={automationThread()}
        folders={[folder()]}
        selectedTask={task({ labels: [] })}
        visibleTaskRuns={[]}
        workflowAgentTooltip="Workflow tooltip"
        localTasksTooltip="Local task tooltip"
        recentRunsTooltip="Runs tooltip"
        onMoveThread={() => undefined}
        onOpenRunThread={() => undefined}
        onRevealWorkspace={() => undefined}
        onOpenWorkflowArtifactThread={() => undefined}
        onUpdateTaskState={() => undefined}
        onUpdateTaskLabels={() => undefined}
        onStartRun={() => undefined}
      />,
    );

    expect(markup).toContain("No runs recorded for this automation thread.");
  });
});

function folder(overrides: Partial<AutomationFolderSummary> = {}): AutomationFolderSummary {
  return {
    id: "home",
    name: "Home",
    kind: "home",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    threads: [],
    ...overrides,
  };
}

function automationThread(overrides: Partial<AutomationThreadSummary> = {}): AutomationThreadSummary {
  return {
    id: "thread-1",
    folderId: "home",
    kind: "orchestration_task",
    sourceId: "task-1",
    title: "Thread title",
    preview: "Thread preview.",
    status: "running",
    projectName: "Project Alpha",
    projectPath: "/tmp/project-alpha",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    badges: [],
    ...overrides,
  };
}

function task(overrides: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "TASK-1",
    title: "Implement detail extraction",
    description: "Move selected thread rendering.",
    state: "ready",
    priority: 2,
    labels: ["user:frontend"],
    blockedBy: [],
    projectPath: "/tmp/project-alpha",
    workspacePath: "/tmp/task-workspace",
    sourceKind: "manual",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: "run-1",
    taskId: "task-1",
    attemptNumber: 1,
    status: "prepared",
    workspacePath: "/tmp/run-workspace",
    startedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function workflowArtifact(overrides: Partial<WorkflowArtifactSummary> = {}): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "workflow-thread-1",
    title: "Artifact workflow",
    status: "approved",
    manifest: {
      id: "workflow",
      name: "Workflow",
      version: 1,
      description: "Workflow",
      inputs: [],
      outputs: [],
      connectors: [],
      permissions: [],
      runLimits: {},
    },
    spec: {
      goal: "Workflow goal",
      successCriteria: [],
      steps: [],
      reviewRequired: false,
    },
    sourcePath: "/tmp/workflow.ts",
    statePath: "/tmp/state.json",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  } as WorkflowArtifactSummary;
}

function workflowThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "home",
    projectName: "Project Alpha",
    projectPath: "/tmp/project-alpha",
    title: "Workflow thread",
    phase: "approved",
    initialRequest: "Build workflow",
    preview: "Workflow preview.",
    status: "approved",
    traceMode: "production",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function workflowRoute(overrides: Partial<WorkflowArtifactThreadRoute> = {}): WorkflowArtifactThreadRoute {
  return {
    kind: "workflow_thread",
    actionLabel: "Open Workflow Agent thread",
    detail: "Open the linked Workflow Agent thread.",
    workflowThreadId: "workflow-thread-1",
    disabled: false,
    ...overrides,
  };
}
