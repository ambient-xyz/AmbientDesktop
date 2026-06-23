import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowRunLimitOverrides,
} from "../../shared/workflowTypes";
import { WorkflowRequestEditor } from "./AutomationsWorkflowDiscoveryViews";
import {
  createAutomationsWorkflowThreadPaneRenderers,
  type AutomationsWorkflowThreadPaneRenderersInput,
} from "./AutomationsWorkflowThreadPaneRenderers";
import { WorkflowFocusedRunsPane } from "./AutomationsWorkflowRuntimeViews";

describe("createAutomationsWorkflowThreadPaneRenderers", () => {
  it("keeps workflow request restart draft handling in the renderer owner", () => {
    const thread = workflowThreadFixture();
    const input = baseInput({
      workflowDiscoveryBusy: `restart:${thread.id}`,
      workflowRequestRestartDrafts: { [thread.id]: "updated request" },
    });
    const renderers = createAutomationsWorkflowThreadPaneRenderers(input);

    const editor = expectElement<Parameters<typeof WorkflowRequestEditor>[0]>(
      renderers.renderWorkflowRequestEditor(thread),
      WorkflowRequestEditor,
    );
    expect(editor.props.requestDraft).toBe("updated request");
    expect(editor.props.requestChanged).toBe(true);
    expect(editor.props.restartBusy).toBe(true);

    editor.props.onDraftChange(thread.id, "next");
    expect(input.actions.setWorkflowRequestRestartDrafts).toHaveBeenCalledWith(expect.any(Function));

    editor.props.onRestart(thread);
    expect(input.actions.restartWorkflowDiscoveryThread).toHaveBeenCalledWith(thread);
  });

  it("forwards focused runs pane state and schedule navigation callbacks", () => {
    const thread = workflowThreadFixture();
    const artifact = workflowArtifactFixture(thread.id);
    const input = baseInput({
      artifactById: new Map([[artifact.id, artifact]]),
      workflowRunsPanelByThreadId: { [thread.id]: "runs-live" },
    });
    const renderers = createAutomationsWorkflowThreadPaneRenderers(input);

    const pane = expectElement<Parameters<typeof WorkflowFocusedRunsPane>[0]>(
      renderers.renderWorkflowThreadRunsPane(thread, artifact),
      WorkflowFocusedRunsPane,
    );
    expect(pane.props.state.activePanelId).toBe("runs-live");
    expect(pane.props.state.artifactById.get(artifact.id)).toBe(artifact);

    pane.props.actions.onOpenSchedule("schedule-1");
    expect(input.actions.focusScheduleHistory).toHaveBeenCalledWith("schedule-1");
    expect(input.actions.onSelectPane).toHaveBeenCalledWith("schedules");
  });
});

function expectElement<Props>(node: ReactNode, type: ReactElement<Props>["type"]): ReactElement<Props> {
  expect(isValidElement(node)).toBe(true);
  const element = node as ReactElement<Props>;
  expect(element.type).toBe(type);
  return element;
}

function baseInput(
  overrides: Partial<AutomationsWorkflowThreadPaneRenderersInput> = {},
): AutomationsWorkflowThreadPaneRenderersInput {
  const input = {
    activeThreadId: "chat-thread-1",
    artifactById: new Map<string, WorkflowArtifactSummary>(),
    automationPluginRegistry: undefined,
    automationSchedules: [],
    expandedScheduleHistoryId: undefined,
    focusedScheduleId: undefined,
    getWorkflowArtifactPanels: () => ({
      renderRunConsole: vi.fn(() => "run console"),
      renderRunConsolePanel: vi.fn(() => "run console panel"),
      renderRuntimeInputPanel: vi.fn(() => "runtime input"),
      renderOutputsPanel: vi.fn(() => "outputs"),
      renderManifestPanel: vi.fn(() => "manifest"),
      renderPermissionsPanel: vi.fn(() => "permissions"),
      renderVersionHistoryPanel: vi.fn(() => "versions"),
    }),
    optimisticWorkflowDiscoveryAnswers: {},
    permissionAudit: [],
    permissionGrantRevoking: undefined,
    permissionGrants: [],
    permissionMode: "workspace",
    renderWorkflowSplitHandle: vi.fn(() => "split"),
    scheduleBusy: false,
    scheduleEnabled: false,
    scheduleError: undefined,
    scheduleExpression: "",
    schedulePreset: "manual",
    scheduleTargetType: undefined,
    selectedWorkflowAgentArtifact: undefined,
    selectedWorkflowAgentDetail: undefined,
    selectedWorkflowAgentSourceNode: undefined,
    selectedWorkflowAgentThread: undefined,
    selectedWorkflowGraphNodeId: undefined,
    tooltips: {
      auditPreview: "Audit preview",
      connectorGrants: "Connector grants",
      reviewQueue: "Review queue",
    },
    workflowArtifactPanelByThreadId: {},
    workflowBusy: undefined,
    workflowCompileProgress: [],
    workflowCompileThreadId: undefined,
    workflowConnectorAccounts: {},
    workflowDashboard: undefined,
    workflowDiscoveryAnswers: {},
    workflowDiscoveryBusy: undefined,
    workflowDiscoveryLayoutStyle: undefined,
    workflowDiscoveryProgress: undefined,
    workflowError: undefined,
    workflowExplorationProgressByThreadId: {},
    workflowExplorationSkippedByThreadId: {},
    workflowExplorationTracesByThreadId: {},
    workflowRequestRef: { current: null },
    workflowRequestRestartDrafts: {},
    workflowRevisions: [],
    workflowRunIdleTimeoutMs: 30_000,
    workflowRunsPanelByThreadId: {},
    workflowRunTotalLimitMode: "disabled",
    workflowSourceDrafts: {},
    workflowThreadChatMessagesByThreadId: {},
    workflowThreadComposerBusy: undefined,
    workflowThreadComposerDrafts: {},
    workflowThreadPlanEditActivityByThreadId: {},
    workflowThreadSessionBusy: undefined,
    workflowVersions: [],
    workspacePath: "/workspace",
    actions: {
      answerWorkflowDiscoveryQuestion: vi.fn(),
      cancelWorkflowRun: vi.fn(),
      clearWorkflowSourceDraft: vi.fn(),
      compileWorkflowThreadPreview: vi.fn(),
      copyWorkflowCompileFailureReport: vi.fn(),
      debugRewriteWorkflowRun: vi.fn(),
      focusScheduleHistory: vi.fn(),
      focusWorkflowRequestEditor: vi.fn(),
      onCreateWorkflowReviewSchedule: vi.fn(),
      onCreateWorkflowScheduleGrant: vi.fn(),
      onOpenMediaModal: vi.fn(),
      onRevokePermissionGrant: vi.fn(),
      onRevokePermissionGrantIds: vi.fn(),
      onScheduleEnabledChange: vi.fn(),
      onScheduleExpressionChange: vi.fn(),
      onSchedulePresetChange: vi.fn(),
      onSelectPane: vi.fn(),
      onSetExpandedScheduleHistoryId: vi.fn(),
      onSetScheduleTarget: vi.fn(),
      onWorkflowRunIdleTimeoutMsChange: vi.fn(),
      onWorkflowRunTotalLimitModeChange: vi.fn(),
      openWorkflowCompileDiagnostics: vi.fn(),
      openWorkflowPanelFromTranscript: vi.fn(),
      openWorkflowPersistentStatusTarget: vi.fn(),
      openWorkflowRunDetail: vi.fn(),
      prepareWorkflowThreadSession: vi.fn(),
      recoverWorkflowRun: vi.fn(),
      rejectWorkflowConnectorGrant: vi.fn(),
      removeWorkflowConnectorScope: vi.fn(),
      resetWorkflowExplorationBudget: vi.fn(),
      restartWorkflowDiscoveryThread: vi.fn(),
      revalidateWorkflowArtifactPreview: vi.fn(),
      resolveWorkflowApproval: vi.fn(),
      resolveWorkflowDiscoveryAccessRequest: vi.fn(),
      resolveWorkflowRevisionProposal: vi.fn(),
      reviewWorkflowArtifact: vi.fn(),
      runWorkflowArtifact: vi.fn(),
      runWorkflowExplorationForThread: vi.fn(),
      saveWorkflowArtifactSource: vi.fn(),
      sendWorkflowThreadComposer: vi.fn(),
      setSelectedWorkflowGraphNodeId: vi.fn(),
      setWorkflowArtifactPanel: vi.fn(),
      setWorkflowBuildPanel: vi.fn(),
      setWorkflowDiscoveryAnswers: vi.fn(),
      setWorkflowRequestRestartDrafts: vi.fn(),
      setWorkflowRunsPanel: vi.fn(),
      setWorkflowSourceDraft: vi.fn(),
      setWorkflowThreadComposerDrafts: vi.fn(),
      skipWorkflowExplorationForThread: vi.fn(),
      startWorkflowArtifactRevision: vi.fn(),
      updateWorkflowConnectorAccount: vi.fn(),
      updateWorkflowConnectorRetention: vi.fn(),
      updateWorkflowExplorationBudget: vi.fn(),
      workflowAuditReportPreview: vi.fn((value?: string) => value ?? ""),
      workflowArtifactRunBlocked: vi.fn(() => false),
      workflowExplorationBudgetsForThread: vi.fn(() => ({
        maxModelTurns: 3,
        maxToolCalls: 4,
        maxConnectorCalls: 4,
        maxAmbientCalls: 2,
        maxElapsedMs: 60_000,
      })),
      workflowRunLimitOverridesForArtifact: vi.fn(() => ({} as WorkflowRunLimitOverrides)),
    },
  } satisfies AutomationsWorkflowThreadPaneRenderersInput;
  return {
    ...input,
    ...overrides,
  };
}

function workflowThreadFixture(): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    title: "Workflow thread",
    initialRequest: "original request",
    discoveryQuestions: [],
  } as unknown as WorkflowAgentThreadSummary;
}

function workflowArtifactFixture(workflowThreadId: string): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId,
    title: "Artifact",
    status: "approved",
    manifest: {
      tools: [],
    },
  } as unknown as WorkflowArtifactSummary;
}
