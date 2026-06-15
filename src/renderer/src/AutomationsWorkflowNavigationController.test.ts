import { describe, expect, it, vi } from "vitest";

import type {
  AutomationThreadSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
} from "../../shared/types";
import {
  automationThreadRouteDetailForNavigation,
  createAutomationsWorkflowNavigationController,
  workflowAgentThreadForNavigationArtifact,
  type AutomationsWorkflowNavigationActions,
  type AutomationsWorkflowNavigationSelection,
} from "./AutomationsWorkflowNavigationController";

describe("AutomationsWorkflowNavigationController", () => {
  it("opens transcript panels and focuses the existing panel target", () => {
    const actions = navigationActions();
    const focusPanelSelector = vi.fn();
    const controller = createAutomationsWorkflowNavigationController({
      actions,
      focusPanelSelector,
      selection: navigationSelection(),
    });

    controller.openWorkflowPanelFromTranscript(undefined, "source");
    expect(actions.setWorkflowArtifactPanel).not.toHaveBeenCalled();
    expect(focusPanelSelector).not.toHaveBeenCalled();

    controller.openWorkflowPanelFromTranscript("workflow-thread-1", "runtime_input");

    expect(actions.setWorkflowArtifactPanel).toHaveBeenCalledWith("workflow-thread-1", "runtime_input");
    expect(focusPanelSelector).toHaveBeenCalledWith("#runs-input");
  });

  it("routes persistent status targets through build, run, and schedule panels", () => {
    const actions = navigationActions();
    const focusPanelSelector = vi.fn();
    const controller = createAutomationsWorkflowNavigationController({
      actions,
      focusPanelSelector,
      selection: navigationSelection(),
    });

    controller.openWorkflowPersistentStatusTarget(undefined, "runs-live");
    expect(actions.setWorkflowRunsPanel).not.toHaveBeenCalled();

    controller.openWorkflowPersistentStatusTarget("workflow-thread-1", "runs-live");
    expect(actions.setWorkflowArtifactPanel).toHaveBeenCalledWith("workflow-thread-1", "run_console");
    expect(actions.setWorkflowRunsPanel).toHaveBeenCalledWith("workflow-thread-1", "runs-live");
    expect(focusPanelSelector).toHaveBeenCalledWith("#runs-live");

    controller.openWorkflowPersistentStatusTarget("workflow-thread-1", "schedules-grants");
    expect(actions.setWorkflowSchedulePanel).toHaveBeenCalledWith("schedules-grants");
    expect(actions.onSelectPane).toHaveBeenCalledWith("schedules");
    expect(focusPanelSelector).toHaveBeenCalledWith("#schedules-grants");

    controller.openWorkflowPersistentStatusTarget("workflow-thread-1", "permissions");
    expect(actions.setWorkflowBuildPanel).toHaveBeenCalledWith("workflow-thread-1", "build-permissions");
  });

  it("opens already-loaded workflow artifact threads before falling back to refresh selection", async () => {
    const artifact = workflowArtifact({ workflowThreadId: "workflow-thread-1" });
    const workflowThread = workflowAgentThread({ id: "workflow-thread-1", activeArtifactId: "artifact-1" });
    const selection = navigationSelection({ artifacts: [artifact], workflowThreads: [workflowThread] });
    const actions = navigationActions();
    const controller = createAutomationsWorkflowNavigationController({
      actions,
      focusPanelSelector: vi.fn(),
      selection,
    });

    expect(workflowAgentThreadForNavigationArtifact(selection, artifact)?.id).toBe("workflow-thread-1");
    await controller.openWorkflowArtifactThread(artifact);

    expect(actions.onSelectWorkflowAgentThread).toHaveBeenCalledWith(workflowThread);
    expect(actions.selectWorkflowAgentThreadForArtifact).not.toHaveBeenCalled();

    const fallbackActions = navigationActions();
    const fallbackController = createAutomationsWorkflowNavigationController({
      actions: fallbackActions,
      focusPanelSelector: vi.fn(),
      selection: navigationSelection({ artifacts: [artifact] }),
    });
    await fallbackController.openWorkflowArtifactThread(artifact);

    expect(fallbackActions.onSelectWorkflowAgentThread).not.toHaveBeenCalled();
    expect(fallbackActions.selectWorkflowAgentThreadForArtifact).toHaveBeenCalledWith(artifact);
  });

  it("opens workflow thread cards through the thread-first route and preserves legacy thread selection", () => {
    const artifact = workflowArtifact();
    const workflowThread = workflowAgentThread();
    const workflowArtifactThread = automationThread({
      kind: "workflow_artifact",
      sourceId: "artifact-1",
    });
    const taskThread = automationThread({
      kind: "orchestration_task",
      sourceId: "task-1",
    });
    const selection = navigationSelection({ artifacts: [artifact], workflowThreads: [workflowThread] });
    const actions = navigationActions();
    const controller = createAutomationsWorkflowNavigationController({
      actions,
      focusPanelSelector: vi.fn(),
      selection,
    });

    expect(automationThreadRouteDetailForNavigation(selection, workflowArtifactThread)).toContain("opens in the Workflow Agent thread");
    expect(automationThreadRouteDetailForNavigation(selection, taskThread)).toBeUndefined();

    controller.openAutomationThreadCard(workflowArtifactThread);
    expect(actions.onSelectWorkflowAgentThread).toHaveBeenCalledWith(workflowThread);
    expect(actions.onSelectThread).not.toHaveBeenCalled();

    controller.openAutomationThreadCard(taskThread);
    expect(actions.onSelectThread).toHaveBeenCalledWith(taskThread);
  });
});

function navigationActions(): AutomationsWorkflowNavigationActions {
  return {
    onSelectPane: vi.fn(),
    onSelectThread: vi.fn(),
    onSelectWorkflowAgentThread: vi.fn(),
    selectWorkflowAgentThreadForArtifact: vi.fn(async () => undefined),
    setWorkflowArtifactPanel: vi.fn(),
    setWorkflowBuildPanel: vi.fn(),
    setWorkflowRunsPanel: vi.fn(),
    setWorkflowSchedulePanel: vi.fn(),
  };
}

function navigationSelection({
  artifacts = [],
  workflowThreads = [],
}: {
  artifacts?: WorkflowArtifactSummary[];
  workflowThreads?: WorkflowAgentThreadSummary[];
} = {}): AutomationsWorkflowNavigationSelection {
  return {
    artifactById: new Map(artifacts.map((artifact) => [artifact.id, artifact])),
    workflowAgentThreadByArtifactId: new Map(
      workflowThreads
        .filter((thread): thread is WorkflowAgentThreadSummary & { activeArtifactId: string } => Boolean(thread.activeArtifactId))
        .map((thread) => [thread.activeArtifactId, thread]),
    ),
    workflowAgentThreadById: new Map(workflowThreads.map((thread) => [thread.id, thread])),
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
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    badges: [],
    ...overrides,
  };
}

function workflowArtifact(overrides: Partial<WorkflowArtifactSummary> = {}): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "workflow-thread-1",
    title: "Artifact",
    summary: "Artifact summary",
    status: "approved",
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    sourcePath: "/workspace/project/WORKFLOW.md",
    manifest: { name: "Workflow", version: "1.0.0", triggers: [], steps: [] },
    spec: { version: "1.0", steps: [] },
    ...overrides,
  } as WorkflowArtifactSummary;
}

function workflowAgentThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "workflow-folder-1",
    activeArtifactId: "artifact-1",
    title: "Workflow thread",
    preview: "Workflow preview",
    status: "ready",
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    graph: undefined,
    latestRun: undefined,
    ...overrides,
  } as WorkflowAgentThreadSummary;
}
