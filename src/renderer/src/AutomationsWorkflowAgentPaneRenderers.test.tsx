import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  WorkflowAgentThreadSummary,
  WorkflowCompileProgress,
  WorkflowRecordingLibraryEntry,
  WorkflowRevisionSummary,
} from "../../shared/workflowTypes";
import {
  createAutomationsWorkflowAgentPaneRenderers,
  type AutomationsWorkflowAgentPaneRenderersInput,
} from "./AutomationsWorkflowAgentPaneRenderers";
import { WorkflowRecordingPlaybookPane } from "./AutomationsWorkflowPlaybookViews";
import { WorkflowAgentCompilerStartPane, WorkflowRecorderStartPane } from "./AutomationsWorkflowUtilityViews";
import { WorkflowAgentPaneRouter } from "./AutomationsWorkspaceShellViews";

describe("createAutomationsWorkflowAgentPaneRenderers", () => {
  it("keeps blank recorder start requests local to the pane owner", async () => {
    const focus = vi.fn();
    const input = baseInput({
      workflowRequest: "",
      workflowRequestRef: { current: { focus } as unknown as HTMLTextAreaElement },
    });
    const renderers = createAutomationsWorkflowAgentPaneRenderers(input);

    const pane = expectElement<Parameters<typeof WorkflowRecorderStartPane>[0]>(
      renderers.renderWorkflowRecorderStartPane(),
      WorkflowRecorderStartPane,
    );
    await pane.props.onStartRecording();

    expect(input.setWorkflowError).toHaveBeenCalledWith("Type a recording goal before starting.");
    expect(focus).toHaveBeenCalled();
    expect(input.onStartWorkflowRecording).not.toHaveBeenCalled();
  });

  it("wires saved playbook scheduling and Workflow Lab actions through injected callbacks", () => {
    const playbook = playbookFixture();
    const input = baseInput();
    const renderers = createAutomationsWorkflowAgentPaneRenderers(input);

    const pane = expectElement<Parameters<typeof WorkflowRecordingPlaybookPane>[0]>(
      renderers.renderWorkflowRecordingPlaybookPane(playbook),
      WorkflowRecordingPlaybookPane,
    );
    pane.props.onSchedulePlaybook(playbook);
    pane.props.onCreateWorkflowLabRun(playbook);
    pane.props.onStartWorkflowLabRun();

    expect(input.clearFocusedSchedule).toHaveBeenCalled();
    expect(input.setScheduleTarget).toHaveBeenCalledWith("workflow_playbook", playbook.id);
    expect(input.onSelectPane).toHaveBeenCalledWith("schedules");
    expect(input.createWorkflowLabRunForPlaybook).toHaveBeenCalledWith(playbook);
    expect(input.startWorkflowLabRun).toHaveBeenCalled();
  });

  it("keeps Workflow Agent router selection and compiler actions delegated", () => {
    const input = baseInput({
      selectedWorkflowAgentThread: workflowThreadFixture(),
      selectedWorkflowRecording: playbookFixture(),
      workflowRevisions: [workflowRevisionFixture()],
    });
    const renderers = createAutomationsWorkflowAgentPaneRenderers(input);

    const router = expectElement<Parameters<typeof WorkflowAgentPaneRouter>[0]>(
      renderers.renderWorkflowAgentPane(),
      WorkflowAgentPaneRouter,
    );
    expect(router.props.selectedDraftRevisionActive).toBe(true);
    expect(router.props.renderWorkflowDiscoveryThread()).toBe("discovery");
    expect(input.renderWorkflowDiscoveryThread).toHaveBeenCalledWith(input.selectedWorkflowAgentThread, input.workflowRevisions[0]);

    const compiler = expectElement<Parameters<typeof WorkflowAgentCompilerStartPane>[0]>(
      renderers.renderWorkflowAgentCompilerStartPane(),
      WorkflowAgentCompilerStartPane,
    );
    expect(compiler.props.discoveryDisabled).toBe(false);
    compiler.props.onCompile();
    expect(input.compileWorkflowPreview).toHaveBeenCalled();
  });
});

function expectElement<Props>(node: ReactNode, type: ReactElement<Props>["type"]): ReactElement<Props> {
  expect(isValidElement(node)).toBe(true);
  const element = node as ReactElement<Props>;
  expect(element.type).toBe(type);
  return element;
}

function baseInput(overrides: Partial<AutomationsWorkflowAgentPaneRenderersInput> = {}): AutomationsWorkflowAgentPaneRenderersInput {
  const input = {
    localTaskPaneRenderers: {
      renderProjectField: vi.fn(() => "project field"),
    },
    selectedWorkflowAgentArtifact: undefined,
    selectedWorkflowAgentThread: undefined,
    selectedWorkflowRecording: undefined,
    surface: {
      disabledStartTitle: "Describe the workflow to record first.",
      legacyCompilerEnabled: true,
      legacyHidden: {
        title: "Hidden",
        detail: "Hidden detail",
        enableInstruction: "Enable the legacy compiler to inspect these controls.",
      },
      primaryCreateLabel: "New workflow",
      startPane: {
        title: "Start",
        detail: "Start detail",
        requestLabel: "Recording goal",
        requestTooltip: "Describe the workflow",
        requestPlaceholder: "Build a workflow",
        bannerTitle: "Start recording",
        bannerDetail: "Banner detail",
        stopButtonLabel: "Stop",
        disabledStartLabel: "Start recording",
        disabledStartTitle: "Describe the workflow to record first.",
        cards: [],
      },
      workflowAgentTooltip: "Workflow Agent",
      workflowLabTooltip: "Workflow Lab",
    },
    workflowBusy: undefined,
    workflowCompileProgress: [] satisfies WorkflowCompileProgress[],
    workflowDiscoveryBusy: undefined,
    workflowError: undefined,
    workflowLabBusy: undefined,
    workflowLabGoal: "Improve workflow",
    workflowLabRun: undefined,
    workflowLabStatus: undefined,
    workflowRecordingExportBusyThreadId: undefined,
    workflowRecordingExportStatus: undefined,
    workflowRecordingLibrary: [playbookFixture()],
    workflowRequest: "Build a workflow",
    workflowRequestRef: { current: null },
    workflowRevisions: [] satisfies WorkflowRevisionSummary[],
    workflowRevisionSource: undefined,
    clearFocusedSchedule: vi.fn(),
    clearWorkflowRevisionDraft: vi.fn(),
    compileWorkflowPreview: vi.fn(),
    copyWorkflowCompileFailureReport: vi.fn(),
    createWorkflowLabRunForPlaybook: vi.fn(),
    createWorkflowSample: vi.fn(),
    exportWorkflowRecordingPlaybookSession: vi.fn(),
    focusWorkflowRequestEditor: vi.fn(),
    loadWorkflowDashboard: vi.fn(),
    onArchiveWorkflowRecordingPlaybook: vi.fn(),
    onEditWorkflowRecordingPlaybook: vi.fn(),
    openWorkflowCompileDiagnostics: vi.fn(),
    onPreviewLocalPath: vi.fn(),
    onRestoreWorkflowRecordingVersion: vi.fn(),
    onSelectPane: vi.fn(),
    onSelectWorkflowRecordingPlaybook: vi.fn(),
    onSetWorkflowRecordingEnabled: vi.fn(),
    onStartWorkflowRecording: vi.fn(async () => true),
    onUnarchiveWorkflowRecordingPlaybook: vi.fn(),
    renderWorkflowDiscoveryThread: vi.fn(() => "discovery"),
    renderWorkflowThreadDetail: vi.fn(() => "thread detail"),
    setScheduleTarget: vi.fn(),
    setWorkflowBusy: vi.fn(),
    setWorkflowError: vi.fn(),
    setWorkflowLabGoal: vi.fn(),
    setWorkflowRequest: vi.fn(),
    startWorkflowDiscoveryFromRequest: vi.fn(),
    startWorkflowLabRun: vi.fn(),
    stopWorkflowLabRun: vi.fn(),
    adoptWorkflowLabBestVariant: vi.fn(),
  } satisfies AutomationsWorkflowAgentPaneRenderersInput;
  return {
    ...input,
    ...overrides,
  };
}

function playbookFixture(): WorkflowRecordingLibraryEntry {
  return {
    id: "playbook-1",
    title: "Playbook",
    summary: "Summary",
    version: 1,
    versions: [],
    enabled: true,
    archivedAt: undefined,
    threadId: "thread-1",
    toolNames: [],
    outputShape: [],
  } as unknown as WorkflowRecordingLibraryEntry;
}

function workflowThreadFixture(): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    initialRequest: "Build a workflow",
  } as unknown as WorkflowAgentThreadSummary;
}

function workflowRevisionFixture(): WorkflowRevisionSummary {
  return {
    id: "revision-1",
    workflowThreadId: "workflow-thread-1",
    status: "draft",
  } as unknown as WorkflowRevisionSummary;
}
