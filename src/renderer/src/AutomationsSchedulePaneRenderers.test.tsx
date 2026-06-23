import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AutomationFolderSummary } from "../../shared/automationTypes";
import type {
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowRunLimitOverrides,
  WorkflowRunSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import {
  createAutomationsSchedulePaneRenderers,
  type AutomationsScheduleControllerForRenderers,
  type AutomationsSchedulePaneRenderersInput,
} from "./AutomationsSchedulePaneRenderers";
import { AutomationSchedulesFallbackPane, WorkflowFocusedSchedulesPane } from "./AutomationsScheduleViews";
import { WorkflowRunCards } from "./AutomationsWorkflowRuntimeViews";

describe("createAutomationsSchedulePaneRenderers", () => {
  it("routes unfocused schedules through the fallback pane with schedule target sources", () => {
    const input = baseInput();
    const renderers = createAutomationsSchedulePaneRenderers(input);

    const pane = expectElement<Parameters<typeof AutomationSchedulesFallbackPane>[0]>(
      renderers.renderSchedulesPane(),
      AutomationSchedulesFallbackPane,
    );

    expect(pane.props.scheduleTargetType).toBe("local_task");
    expect(pane.props.targetSources.tasks).toEqual(input.orchestrationTasks);
    expect(pane.props.targetSources.workflowRecordingLibrary).toEqual(input.workflowRecordingLibrary);
    pane.props.onSaveSchedule();
    expect(input.scheduleController.createAutomationSchedule).toHaveBeenCalledWith(pane.props.targetSources);
  });

  it("routes selected workflow schedules through the focused pane without changing controller ownership", () => {
    const thread = workflowThreadFixture();
    const artifact = workflowArtifactFixture(thread.id);
    const version = workflowVersionFixture(thread.id, artifact.id);
    const input = baseInput({
      selectedWorkflowAgentThread: thread,
      selectedWorkflowAgentArtifact: artifact,
      workflowAgentThreadById: new Map([[thread.id, thread]]),
      artifactById: new Map([[artifact.id, artifact]]),
      workflowVersions: [version, workflowVersionFixture("other-thread", "other-artifact")],
    });
    const renderers = createAutomationsSchedulePaneRenderers(input);

    const pane = expectElement<Parameters<typeof WorkflowFocusedSchedulesPane>[0]>(
      renderers.renderSchedulesPane(),
      WorkflowFocusedSchedulesPane,
    );

    expect(pane.props.thread).toBe(thread);
    expect(pane.props.artifact).toBe(artifact);
    expect(pane.props.state.versions).toEqual([version]);
    expect(input.scheduleController.scheduleRunLimitsForArtifact).toHaveBeenCalledWith(artifact);

    pane.props.actions.onSaveSchedule("workflow_thread", thread.id);
    expect(input.scheduleController.saveWorkflowSchedule).toHaveBeenCalledWith("workflow_thread", thread.id, artifact);

    pane.props.actions.onOpenRunDetail("run-1");
    expect(input.actions.openWorkflowRunDetail).toHaveBeenCalledWith("run-1", { focusConsole: true });
  });

  it("keeps schedule navigation and resume callbacks on workflow run cards", () => {
    const thread = workflowThreadFixture();
    const artifact = workflowArtifactFixture(thread.id);
    const run = workflowRunFixture(artifact.id);
    const input = baseInput({
      artifactById: new Map([[artifact.id, artifact]]),
    });
    const renderers = createAutomationsSchedulePaneRenderers(input);

    const cards = expectElement<Parameters<typeof WorkflowRunCards>[0]>(
      renderers.renderWorkflowRunCards([run], 8),
      WorkflowRunCards,
    );
    expect(cards.props.limit).toBe(8);

    cards.props.onOpenSchedule("schedule-1");
    expect(input.scheduleController.focusScheduleHistory).toHaveBeenCalledWith("schedule-1");
    expect(input.actions.onSelectPane).toHaveBeenCalledWith("schedules");

    cards.props.onResumeRun(run, artifact);
    expect(input.actions.workflowRunLimitOverridesForArtifact).toHaveBeenCalledWith(artifact);
    expect(input.actions.runWorkflowArtifact).toHaveBeenCalledWith(artifact.id, "execute", {
      resumeFromRunId: run.id,
      allowUnapproved: false,
      runLimits: {},
    });
  });
});

function expectElement<Props>(node: ReactNode, type: ReactElement<Props>["type"]): ReactElement<Props> {
  expect(isValidElement(node)).toBe(true);
  const element = node as ReactElement<Props>;
  expect(element.type).toBe(type);
  return element;
}

function baseInput(overrides: Partial<AutomationsSchedulePaneRenderersInput> = {}): AutomationsSchedulePaneRenderersInput {
  const folder = folderFixture();
  const workflowFolder = workflowFolderFixture();
  const input = {
    activeThreadId: "chat-thread-1",
    artifactById: new Map<string, WorkflowArtifactSummary>(),
    folders: [folder],
    localTaskPaneRenderers: {
      renderProjectField: vi.fn(() => "project-field"),
      renderAutoDispatchToggle: vi.fn(() => "auto-toggle"),
      renderAutoDispatchStatus: vi.fn(() => "auto-status"),
    },
    orchestrationTasks: [{ id: "task-1", identifier: "TASK-1", title: "Task" }],
    permissionAudit: [],
    permissionGrants: [],
    permissionMode: "workspace",
    renderWorkflowPersistentDiagramPane: vi.fn(() => "diagram"),
    renderWorkflowSplitHandle: vi.fn(() => "split"),
    scheduleController: scheduleControllerFixture(),
    selectedWorkflowAgentArtifact: undefined,
    selectedWorkflowAgentDetail: undefined,
    selectedWorkflowAgentThread: undefined,
    tooltips: {
      autoDispatch: "Auto-dispatch",
      schedules: "Schedules",
    },
    workflowAgentFolders: [workflowFolder],
    workflowAgentThreadByArtifactId: new Map<string, WorkflowAgentThreadSummary>(),
    workflowAgentThreadById: new Map<string, WorkflowAgentThreadSummary>(),
    workflowCompileProgress: [],
    workflowCompileThreadId: undefined,
    workflowDashboard: {
      artifacts: [],
      runs: [],
    },
    workflowDiscoveryBusy: undefined,
    workflowDiscoveryLayoutStyle: {},
    workflowRecordingLibrary: [{ id: "playbook-1", title: "Playbook", version: 1, enabled: true }],
    workflowRunIdleTimeoutMs: 30_000,
    workflowRunTotalLimitMode: "disabled",
    workflowBusy: undefined,
    workflowVersions: [],
    workspacePath: "/workspace",
    actions: {
      onOpenRunThread: vi.fn(),
      onSelectPane: vi.fn(),
      openWorkflowPersistentStatusTarget: vi.fn(),
      openWorkflowRunDetail: vi.fn(),
      runWorkflowArtifact: vi.fn(),
      workflowRunLimitOverridesForArtifact: vi.fn(() => ({} as WorkflowRunLimitOverrides)),
    },
  } satisfies AutomationsSchedulePaneRenderersInput;
  return {
    ...input,
    ...overrides,
  };
}

function scheduleControllerFixture(
  overrides: Partial<AutomationsScheduleControllerForRenderers> = {},
): AutomationsScheduleControllerForRenderers {
  return {
    automationSchedules: [],
    automationScheduleExceptions: [],
    clearFocusedSchedule: vi.fn(),
    createAutomationSchedule: vi.fn(),
    createNewWorkflowScheduleSeries: vi.fn(),
    createWorkflowScheduleGrant: vi.fn(),
    createWorkflowScheduleGrantAction: vi.fn(),
    deferWorkflowScheduleOccurrence: vi.fn(),
    duplicateAutomationSchedule: vi.fn(),
    editAutomationSchedule: vi.fn(),
    editOccurrenceSeriesScope: vi.fn(),
    expandedScheduleHistoryId: undefined,
    focusScheduleHistory: vi.fn(),
    focusedScheduleId: undefined,
    loadAutomationSchedules: vi.fn(),
    openWorkflowScheduleOccurrenceEditor: vi.fn(),
    saveWorkflowSchedule: vi.fn(),
    saveWorkflowScheduleOccurrenceEditor: vi.fn(),
    scheduleBusy: false,
    scheduleEditScope: "all_occurrences",
    scheduleEnabled: true,
    scheduleError: undefined,
    scheduleExpression: "0 9 * * *",
    scheduleOccurrenceEditor: undefined,
    schedulePreset: "daily",
    scheduleRunIdleTimeoutMs: 30_000,
    scheduleRunLimitsForArtifact: vi.fn(() => ({} as WorkflowRunLimitOverrides)),
    scheduleRunTotalLimitMode: "disabled",
    scheduleTargetId: "",
    scheduleTargetType: "local_task",
    setExpandedScheduleHistoryId: vi.fn(),
    setScheduleEditScope: vi.fn(),
    setScheduleEnabled: vi.fn(),
    setScheduleExpression: vi.fn(),
    setScheduleOccurrenceEditor: vi.fn(),
    setSchedulePreset: vi.fn(),
    setScheduleRunIdleTimeoutMs: vi.fn(),
    setScheduleRunTotalLimitMode: vi.fn(),
    setScheduleTarget: vi.fn(),
    setScheduleTargetId: vi.fn(),
    setScheduleTargetTypeAndClearId: vi.fn(),
    setWorkflowSchedulePanel: vi.fn(),
    skipWorkflowScheduleOccurrence: vi.fn(),
    updateWorkflowScheduleOccurrenceRunLimits: vi.fn(),
    workflowSchedulePanel: "schedules-overview",
    ...overrides,
  };
}

function folderFixture(): AutomationFolderSummary {
  return {
    id: "folder-1",
    kind: "custom",
    name: "Folder",
    threads: [],
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
  };
}

function workflowFolderFixture(): WorkflowAgentFolderSummary {
  return {
    id: "workflow-folder-1",
    name: "Workflow Folder",
    threads: [],
  } as unknown as WorkflowAgentFolderSummary;
}

function workflowThreadFixture(): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    title: "Workflow thread",
    initialRequest: "request",
  } as unknown as WorkflowAgentThreadSummary;
}

function workflowArtifactFixture(workflowThreadId: string): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId,
    title: "Artifact",
    status: "approved",
    manifest: {},
  } as unknown as WorkflowArtifactSummary;
}

function workflowVersionFixture(workflowThreadId: string, artifactId: string): WorkflowVersionSummary {
  return {
    id: `version-${workflowThreadId}`,
    workflowThreadId,
    artifactId,
    version: 1,
    status: "approved",
  } as unknown as WorkflowVersionSummary;
}

function workflowRunFixture(artifactId: string): WorkflowRunSummary {
  return {
    id: "run-1",
    artifactId,
    status: "failed",
    startedAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:01:00.000Z",
  } as unknown as WorkflowRunSummary;
}
