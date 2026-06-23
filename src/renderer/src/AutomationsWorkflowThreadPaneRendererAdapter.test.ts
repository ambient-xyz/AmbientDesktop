import { describe, expect, it, vi } from "vitest";

import type { WorkflowArtifactSummary } from "../../shared/workflowTypes";
import { createAutomationsWorkflowThreadPaneRenderers } from "./AutomationsWorkflowThreadPaneRenderers";
import {
  createAutomationsWorkflowThreadPaneRenderersForWorkspace,
  type AutomationsWorkflowThreadPaneRendererAdapterInput,
} from "./AutomationsWorkflowThreadPaneRendererAdapter";

vi.mock("./AutomationsWorkflowThreadPaneRenderers", () => ({
  createAutomationsWorkflowThreadPaneRenderers: vi.fn(() => ({
    renderWorkflowDiscoveryThread: vi.fn(),
    renderWorkflowPersistentDiagramPane: vi.fn(),
    renderWorkflowThreadDetail: vi.fn(),
    renderWorkflowThreadRunsPane: vi.fn(),
  })),
}));

describe("createAutomationsWorkflowThreadPaneRenderersForWorkspace", () => {
  it("adapts workspace controller state and actions into the thread pane renderer contract", () => {
    const input = baseInput();

    createAutomationsWorkflowThreadPaneRenderersForWorkspace(input);

    const rendererInput = vi.mocked(createAutomationsWorkflowThreadPaneRenderers).mock.calls[0]?.[0];
    expect(rendererInput).toBeTruthy();
    expect(rendererInput?.automationSchedules).toBe(input.controllers.scheduleController.automationSchedules);
    expect(rendererInput?.workflowDashboard).toBe(input.controllers.workflowDashboardController.workflowDashboard);
    expect(rendererInput?.workflowArtifactPanelByThreadId).toBe(input.controllers.workflowWorkspaceController.workflowArtifactPanelByThreadId);
    expect(rendererInput?.workflowDiscoveryAnswers).toBe(input.controllers.workflowDiscoveryController.workflowDiscoveryAnswers);
    expect(rendererInput?.workflowThreadComposerDrafts).toBe(input.controllers.workflowThreadController.workflowThreadComposerDrafts);
    expect(rendererInput?.actions.runWorkflowArtifact).toBe(input.controllers.workflowArtifactController.runWorkflowArtifact);
    expect(rendererInput?.actions.onSelectPane).toBe(input.actions.onSelectPane);

    rendererInput?.actions.onCreateWorkflowReviewSchedule("workflow_thread", "thread-1");
    expect(input.controllers.scheduleController.createWorkflowReviewSchedule).toHaveBeenCalledWith(
      "workflow_thread",
      "thread-1",
      input.selectedWorkflowAgentArtifact,
    );
  });
});

function baseInput(): AutomationsWorkflowThreadPaneRendererAdapterInput {
  const selectedWorkflowAgentArtifact = { id: "artifact-1", title: "Artifact" } as WorkflowArtifactSummary;
  return {
    activeThreadId: "thread-1",
    artifactById: new Map(),
    automationPluginRegistry: undefined,
    getWorkflowArtifactPanels: vi.fn(),
    permissionAudit: [],
    permissionGrantRevoking: undefined,
    permissionGrants: [],
    permissionMode: "ask",
    renderWorkflowSplitHandle: vi.fn(),
    selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail: undefined,
    selectedWorkflowAgentSourceNode: undefined,
    selectedWorkflowAgentThread: undefined,
    selectedWorkflowGraphNodeId: undefined,
    tooltips: {
      auditPreview: "Audit",
      connectorGrants: "Grants",
      reviewQueue: "Review",
    },
    workflowBusy: "workflow-busy",
    workflowCompileProgress: [],
    workflowConnectorAccounts: {},
    workflowDiscoveryProgress: undefined,
    workflowError: undefined,
    workflowExplorationProgressByThreadId: {},
    workflowRunIdleTimeoutMs: 30_000,
    workflowRunTotalLimitMode: "default",
    workspacePath: "/tmp/workspace",
    controllers: {
      scheduleController: {
        automationSchedules: [{ id: "schedule-1" }],
        expandedScheduleHistoryId: "schedule-1",
        focusedScheduleId: "schedule-1",
        scheduleBusy: "schedule-busy",
        scheduleEnabled: true,
        scheduleError: undefined,
        scheduleExpression: "0 * * * *",
        schedulePreset: "hourly",
        scheduleTargetType: "workflow_artifact",
        createWorkflowReviewSchedule: vi.fn(),
        createWorkflowScheduleGrant: vi.fn(),
        focusScheduleHistory: vi.fn(),
        setExpandedScheduleHistoryId: vi.fn(),
        setScheduleEnabled: vi.fn(),
        setScheduleExpression: vi.fn(),
        setSchedulePreset: vi.fn(),
        setScheduleTarget: vi.fn(),
      },
      workflowArtifactController: {
        cancelWorkflowRun: vi.fn(),
        debugRewriteWorkflowRun: vi.fn(),
        recoverWorkflowRun: vi.fn(),
        rejectWorkflowConnectorGrant: vi.fn(),
        removeWorkflowConnectorScope: vi.fn(),
        revalidateWorkflowArtifactPreview: vi.fn(),
        resolveWorkflowApproval: vi.fn(),
        resolveWorkflowRevisionProposal: vi.fn(),
        reviewWorkflowArtifact: vi.fn(),
        runWorkflowArtifact: vi.fn(),
        runLimitsForArtifact: vi.fn(),
        saveWorkflowArtifactSource: vi.fn(),
        updateWorkflowConnectorAccount: vi.fn(),
        updateWorkflowConnectorRetention: vi.fn(),
      },
      workflowDashboardController: {
        workflowDashboard: { artifacts: [], runs: [] },
        workflowExplorationTracesByThreadId: {},
        workflowRevisions: [],
        workflowVersions: [],
        openWorkflowRunDetail: vi.fn(),
      },
      workflowDiscoveryController: {
        answerWorkflowDiscoveryQuestion: vi.fn(),
        compileWorkflowThreadPreview: vi.fn(),
        copyWorkflowCompileFailureReport: vi.fn(),
        focusWorkflowRequestEditor: vi.fn(),
        openWorkflowCompileDiagnostics: vi.fn(),
        optimisticWorkflowDiscoveryAnswers: {},
        resetWorkflowExplorationBudget: vi.fn(),
        restartWorkflowDiscoveryThread: vi.fn(),
        resolveWorkflowDiscoveryAccessRequest: vi.fn(),
        runWorkflowExplorationForThread: vi.fn(),
        setWorkflowDiscoveryAnswers: vi.fn(),
        setWorkflowRequestRestartDrafts: vi.fn(),
        skipWorkflowExplorationForThread: vi.fn(),
        startWorkflowArtifactRevision: vi.fn(),
        updateWorkflowExplorationBudget: vi.fn(),
        workflowCompileThreadId: "compile-thread",
        workflowDiscoveryAnswers: {},
        workflowDiscoveryBusy: undefined,
        workflowExplorationBudgetsForThread: vi.fn(),
        workflowExplorationSkippedByThreadId: {},
        workflowRequestRef: { current: null },
        workflowRequestRestartDrafts: {},
      },
      workflowThreadController: {
        prepareWorkflowThreadSession: vi.fn(),
        sendWorkflowThreadComposer: vi.fn(),
        setWorkflowThreadComposerDrafts: vi.fn(),
        workflowThreadChatMessagesByThreadId: {},
        workflowThreadComposerBusy: undefined,
        workflowThreadComposerDrafts: {},
        workflowThreadPlanEditActivityByThreadId: {},
        workflowThreadSessionBusy: undefined,
      },
      workflowWorkspaceController: {
        clearWorkflowSourceDraft: vi.fn(),
        setSelectedWorkflowGraphNodeId: vi.fn(),
        setWorkflowArtifactPanel: vi.fn(),
        setWorkflowBuildPanel: vi.fn(),
        setWorkflowRunsPanel: vi.fn(),
        setWorkflowSourceDraft: vi.fn(),
        workflowArtifactPanelByThreadId: {},
        workflowDiscoveryLayoutStyle: "single",
        workflowRunsPanelByThreadId: {},
        workflowSourceDrafts: {},
      },
    },
    actions: {
      onOpenMediaModal: vi.fn(),
      onRevokePermissionGrant: vi.fn(),
      onRevokePermissionGrantIds: vi.fn(),
      onSelectPane: vi.fn(),
      onWorkflowRunIdleTimeoutMsChange: vi.fn(),
      onWorkflowRunTotalLimitModeChange: vi.fn(),
      openWorkflowPanelFromTranscript: vi.fn(),
      openWorkflowPersistentStatusTarget: vi.fn(),
      workflowArtifactRunBlocked: vi.fn(),
      workflowAuditReportPreview: vi.fn(),
    },
  } as unknown as AutomationsWorkflowThreadPaneRendererAdapterInput;
}
