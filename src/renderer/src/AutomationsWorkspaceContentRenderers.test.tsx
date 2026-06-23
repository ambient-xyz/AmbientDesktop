import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AutomationThreadSummary } from "../../shared/automationTypes";
import type { OrchestrationRun, WorkflowRecordingLibraryEntry, WorkflowRunSummary } from "../../shared/workflowTypes";
import {
  createAutomationsWorkspaceContentRenderers,
  type AutomationsWorkspaceContentRenderersInput,
} from "./AutomationsWorkspaceContentRenderers";
import { AutomationsWorkspaceRunsReviewsPane } from "./AutomationsWorkspaceHomeViews";
import { AutomationSelectedThreadDetailView } from "./AutomationsThreadDetailViews";
import { AutomationPaneRouter } from "./AutomationsWorkspaceShellViews";

describe("createAutomationsWorkspaceContentRenderers", () => {
  it("keeps selected playbook and runs-review pane routing delegated through injected renderers", () => {
    const selectedPlaybook = playbookFixture("playbook-selected");
    const input = baseInput({ selectedWorkflowRecording: selectedPlaybook });
    const renderers = createAutomationsWorkspaceContentRenderers(input);

    const router = expectElement<Parameters<typeof AutomationPaneRouter>[0]>(renderers.renderAutomationPane(), AutomationPaneRouter);
    expect(router.props.selectedWorkflowRecordingActive).toBe(true);
    expect(router.props.renderWorkflowRecordingPlaybookPane()).toBe("playbook-pane:playbook-selected");
    expect(input.renderers.renderWorkflowRecordingPlaybookPane).toHaveBeenCalledWith(selectedPlaybook);

    const runsPane = expectElement<Parameters<typeof AutomationsWorkspaceRunsReviewsPane>[0]>(
      router.props.renderRunsReviewsPane(),
      AutomationsWorkspaceRunsReviewsPane,
    );
    expect(runsPane.props.localTaskRuns).toBe("task-runs:1:8");
    expect(runsPane.props.workflowRuns).toBe("workflow-runs:1:8");
    expect(runsPane.props.workflowConsole).toBe("run-console:run-detail");
    expect(runsPane.props.renderWorkflowThreadRunsPane).toBe(input.renderers.renderWorkflowThreadRunsPane);
    expect(runsPane.props.renderLegacyWorkflowHiddenPane).toBe(input.renderers.renderLegacyWorkflowHiddenPane);
  });

  it("passes selected-thread detail props through the detail renderer", () => {
    const selectedThread = automationThreadFixture("thread-selected");
    const input = baseInput({ selectedThreadDetail: { ...baseInput().selectedThreadDetail, selectedThread } });
    const renderers = createAutomationsWorkspaceContentRenderers(input);

    const detail = expectElement<Parameters<typeof AutomationSelectedThreadDetailView>[0]>(
      renderers.renderSelectedThreadDetail(),
      AutomationSelectedThreadDetailView,
    );
    expect(detail.props.selectedThread).toBe(selectedThread);
    expect(detail.props.onOpenRunThread).toBe(input.selectedThreadDetail.onOpenRunThread);
    expect(detail.props.onStartRun).toBe(input.selectedThreadDetail.onStartRun);
  });

  it("omits selected-thread detail when no thread is active", () => {
    const renderers = createAutomationsWorkspaceContentRenderers(baseInput());
    expect(renderers.renderSelectedThreadDetail()).toBeNull();
  });
});

function expectElement<Props>(node: ReactNode, type: ReactElement<Props>["type"]): ReactElement<Props> {
  expect(isValidElement(node)).toBe(true);
  const element = node as ReactElement<Props>;
  expect(element.type).toBe(type);
  return element;
}

function baseInput(overrides: Partial<AutomationsWorkspaceContentRenderersInput> = {}): AutomationsWorkspaceContentRenderersInput {
  const input = {
    activePane: "home",
    selectedWorkflowRecording: undefined,
    selectedWorkflowAgentThread: undefined,
    selectedWorkflowAgentArtifact: undefined,
    legacyCompilerEnabled: true,
    allAutomationThreads: [automationThreadFixture("thread-1")],
    allTaskRuns: [{ id: "task-run-1" } as OrchestrationRun],
    workflowRuns: [{ id: "workflow-run-1" } as WorkflowRunSummary],
    workflowDetail: { run: { id: "run-detail" } } as AutomationsWorkspaceContentRenderersInput["workflowDetail"],
    reviewTooltip: "Review queue",
    routeDetailForThread: vi.fn(() => "route detail"),
    homePane: {
      homeExplainer: [],
      newWorkflowLabel: "New Workflow",
      playbooks: [playbookFixture("playbook-1")],
      query: "",
      includeArchived: false,
      refreshing: false,
      exportBusyThreadId: undefined,
      exportStatus: undefined,
      onQueryChange: vi.fn(),
      onIncludeArchivedChange: vi.fn(),
      onRefresh: vi.fn(),
      onEditPlaybook: vi.fn(),
      onOpenPlaybook: vi.fn(),
      onPreviewLocalPath: vi.fn(),
      onExportPlaybookSession: vi.fn(),
      onRestoreVersion: vi.fn(),
      onSetEnabled: vi.fn(),
      onUnarchivePlaybook: vi.fn(),
      onArchivePlaybook: vi.fn(),
    },
    selectedThreadDetail: {
      selectedThread: undefined,
      folders: [],
      selectedAutomationRun: undefined,
      selectedArtifact: undefined,
      selectedArtifactThreadRoute: undefined,
      selectedArtifactWorkflowThread: undefined,
      selectedTask: undefined,
      visibleTaskRuns: [],
      startingRunId: undefined,
      workflowAgentTooltip: "Workflow Agent",
      localTasksTooltip: "Local Tasks",
      recentRunsTooltip: "Recent Runs",
      onMoveThread: vi.fn(),
      onOpenRunThread: vi.fn(),
      onRevealWorkspace: vi.fn(),
      onOpenWorkflowArtifactThread: vi.fn(),
      onUpdateTaskState: vi.fn(),
      onUpdateTaskLabels: vi.fn(),
      onStartRun: vi.fn(),
    },
    renderers: {
      localTaskPaneRenderers: {
        renderFolderPane: vi.fn(() => "folder-pane"),
        renderLocalTasksPane: vi.fn(() => "local-tasks-pane"),
        renderTaskRuns: vi.fn((runs: OrchestrationRun[], limit?: number) => `task-runs:${runs.length}:${limit}`),
      },
      schedulePaneRenderers: {
        renderSchedulesPane: vi.fn(() => "schedules-pane"),
        renderWorkflowRunCards: vi.fn((runs: WorkflowRunSummary[], limit?: number) => `workflow-runs:${runs.length}:${limit}`),
      },
      workflowArtifactPanels: {
        renderRunConsole: vi.fn((detail: AutomationsWorkspaceContentRenderersInput["workflowDetail"]) => `run-console:${detail?.run.id}`),
      },
      renderLegacyWorkflowHiddenPane: vi.fn(() => "legacy-hidden-pane"),
      renderWorkflowAgentPane: vi.fn(() => "workflow-agent-pane"),
      renderWorkflowLabHomePane: vi.fn(() => "workflow-lab-pane"),
      renderWorkflowRecordingPlaybookPane: vi.fn((playbook: WorkflowRecordingLibraryEntry) => `playbook-pane:${playbook.id}`),
      renderWorkflowThreadRunsPane: vi.fn(() => "workflow-thread-runs-pane"),
    },
    actions: {
      onOpenThread: vi.fn(),
      onSelectPane: vi.fn(),
    },
  } satisfies AutomationsWorkspaceContentRenderersInput;
  return { ...input, ...overrides };
}

function automationThreadFixture(id: string): AutomationThreadSummary {
  return {
    id,
    title: id,
    preview: `${id} preview`,
    kind: "orchestration_task",
    sourceId: `${id}-source`,
    status: "ready",
    projectName: "Project",
    projectPath: "/tmp/project",
    folderId: "folder-1",
    needsReview: false,
    badges: [],
    updatedAt: "2026-06-22T00:00:00.000Z",
    createdAt: "2026-06-22T00:00:00.000Z",
  };
}

function playbookFixture(id: string): WorkflowRecordingLibraryEntry {
  return {
    id,
    title: id,
    summary: `${id} summary`,
    enabled: true,
  } as WorkflowRecordingLibraryEntry;
}
