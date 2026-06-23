import type { useAutomationScheduleController } from "./AutomationsScheduleController";
import type { useAutomationsWorkflowArtifactController } from "./AutomationsWorkflowArtifactController";
import type { useAutomationsWorkflowDashboardController } from "./AutomationsWorkflowDashboardController";
import type { useAutomationsWorkflowDiscoveryController } from "./AutomationsWorkflowDiscoveryController";
import type { useAutomationsWorkflowThreadController } from "./AutomationsWorkflowThreadController";
import type { useAutomationsWorkflowWorkspaceController } from "./AutomationsWorkflowWorkspaceController";
import {
  createAutomationsWorkflowThreadPaneRenderers,
  type AutomationsWorkflowThreadPaneRenderersInput,
} from "./AutomationsWorkflowThreadPaneRenderers";

type ThreadPaneInput = AutomationsWorkflowThreadPaneRenderersInput;

export type AutomationsWorkflowThreadPaneRendererAdapterInput = {
  activeThreadId?: ThreadPaneInput["activeThreadId"];
  artifactById: ThreadPaneInput["artifactById"];
  automationPluginRegistry: ThreadPaneInput["automationPluginRegistry"];
  getWorkflowArtifactPanels: ThreadPaneInput["getWorkflowArtifactPanels"];
  permissionAudit: ThreadPaneInput["permissionAudit"];
  permissionGrantRevoking: ThreadPaneInput["permissionGrantRevoking"];
  permissionGrants: ThreadPaneInput["permissionGrants"];
  permissionMode: ThreadPaneInput["permissionMode"];
  renderWorkflowSplitHandle: ThreadPaneInput["renderWorkflowSplitHandle"];
  selectedWorkflowAgentArtifact: ThreadPaneInput["selectedWorkflowAgentArtifact"];
  selectedWorkflowAgentDetail: ThreadPaneInput["selectedWorkflowAgentDetail"];
  selectedWorkflowAgentSourceNode: ThreadPaneInput["selectedWorkflowAgentSourceNode"];
  selectedWorkflowAgentThread: ThreadPaneInput["selectedWorkflowAgentThread"];
  selectedWorkflowGraphNodeId: ThreadPaneInput["selectedWorkflowGraphNodeId"];
  tooltips: ThreadPaneInput["tooltips"];
  workflowCompileProgress: ThreadPaneInput["workflowCompileProgress"];
  workflowBusy: ThreadPaneInput["workflowBusy"];
  workflowConnectorAccounts: ThreadPaneInput["workflowConnectorAccounts"];
  workflowDiscoveryProgress: ThreadPaneInput["workflowDiscoveryProgress"];
  workflowError: ThreadPaneInput["workflowError"];
  workflowExplorationProgressByThreadId: ThreadPaneInput["workflowExplorationProgressByThreadId"];
  workflowRunIdleTimeoutMs: ThreadPaneInput["workflowRunIdleTimeoutMs"];
  workflowRunTotalLimitMode: ThreadPaneInput["workflowRunTotalLimitMode"];
  workspacePath: ThreadPaneInput["workspacePath"];
  controllers: {
    scheduleController: ReturnType<typeof useAutomationScheduleController>;
    workflowArtifactController: ReturnType<typeof useAutomationsWorkflowArtifactController>;
    workflowDashboardController: ReturnType<typeof useAutomationsWorkflowDashboardController>;
    workflowDiscoveryController: ReturnType<typeof useAutomationsWorkflowDiscoveryController>;
    workflowThreadController: ReturnType<typeof useAutomationsWorkflowThreadController>;
    workflowWorkspaceController: ReturnType<typeof useAutomationsWorkflowWorkspaceController>;
  };
  actions: {
    onOpenMediaModal: ThreadPaneInput["actions"]["onOpenMediaModal"];
    onRevokePermissionGrant: ThreadPaneInput["actions"]["onRevokePermissionGrant"];
    onRevokePermissionGrantIds: ThreadPaneInput["actions"]["onRevokePermissionGrantIds"];
    onSelectPane: ThreadPaneInput["actions"]["onSelectPane"];
    onWorkflowRunIdleTimeoutMsChange: ThreadPaneInput["actions"]["onWorkflowRunIdleTimeoutMsChange"];
    onWorkflowRunTotalLimitModeChange: ThreadPaneInput["actions"]["onWorkflowRunTotalLimitModeChange"];
    openWorkflowPanelFromTranscript: ThreadPaneInput["actions"]["openWorkflowPanelFromTranscript"];
    openWorkflowPersistentStatusTarget: ThreadPaneInput["actions"]["openWorkflowPersistentStatusTarget"];
    workflowArtifactRunBlocked: ThreadPaneInput["actions"]["workflowArtifactRunBlocked"];
    workflowAuditReportPreview: ThreadPaneInput["actions"]["workflowAuditReportPreview"];
  };
};

export function createAutomationsWorkflowThreadPaneRenderersForWorkspace(input: AutomationsWorkflowThreadPaneRendererAdapterInput) {
  const {
    scheduleController,
    workflowArtifactController,
    workflowDashboardController,
    workflowDiscoveryController,
    workflowThreadController,
    workflowWorkspaceController,
  } = input.controllers;

  return createAutomationsWorkflowThreadPaneRenderers({
    activeThreadId: input.activeThreadId,
    artifactById: input.artifactById,
    automationPluginRegistry: input.automationPluginRegistry,
    automationSchedules: scheduleController.automationSchedules,
    expandedScheduleHistoryId: scheduleController.expandedScheduleHistoryId,
    focusedScheduleId: scheduleController.focusedScheduleId,
    getWorkflowArtifactPanels: input.getWorkflowArtifactPanels,
    optimisticWorkflowDiscoveryAnswers: workflowDiscoveryController.optimisticWorkflowDiscoveryAnswers,
    permissionAudit: input.permissionAudit,
    permissionGrantRevoking: input.permissionGrantRevoking,
    permissionGrants: input.permissionGrants,
    permissionMode: input.permissionMode,
    renderWorkflowSplitHandle: input.renderWorkflowSplitHandle,
    scheduleBusy: scheduleController.scheduleBusy,
    scheduleEnabled: scheduleController.scheduleEnabled,
    scheduleError: scheduleController.scheduleError,
    scheduleExpression: scheduleController.scheduleExpression,
    schedulePreset: scheduleController.schedulePreset,
    scheduleTargetType: scheduleController.scheduleTargetType,
    selectedWorkflowAgentArtifact: input.selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail: input.selectedWorkflowAgentDetail,
    selectedWorkflowAgentSourceNode: input.selectedWorkflowAgentSourceNode,
    selectedWorkflowAgentThread: input.selectedWorkflowAgentThread,
    selectedWorkflowGraphNodeId: input.selectedWorkflowGraphNodeId,
    tooltips: input.tooltips,
    workflowArtifactPanelByThreadId: workflowWorkspaceController.workflowArtifactPanelByThreadId,
    workflowBusy: input.workflowBusy,
    workflowCompileProgress: input.workflowCompileProgress,
    workflowCompileThreadId: workflowDiscoveryController.workflowCompileThreadId,
    workflowConnectorAccounts: input.workflowConnectorAccounts,
    workflowDashboard: workflowDashboardController.workflowDashboard,
    workflowDiscoveryAnswers: workflowDiscoveryController.workflowDiscoveryAnswers,
    workflowDiscoveryBusy: workflowDiscoveryController.workflowDiscoveryBusy,
    workflowDiscoveryLayoutStyle: workflowWorkspaceController.workflowDiscoveryLayoutStyle,
    workflowDiscoveryProgress: input.workflowDiscoveryProgress,
    workflowError: input.workflowError,
    workflowExplorationProgressByThreadId: input.workflowExplorationProgressByThreadId,
    workflowExplorationSkippedByThreadId: workflowDiscoveryController.workflowExplorationSkippedByThreadId,
    workflowExplorationTracesByThreadId: workflowDashboardController.workflowExplorationTracesByThreadId,
    workflowRequestRef: workflowDiscoveryController.workflowRequestRef,
    workflowRequestRestartDrafts: workflowDiscoveryController.workflowRequestRestartDrafts,
    workflowRevisions: workflowDashboardController.workflowRevisions,
    workflowRunIdleTimeoutMs: input.workflowRunIdleTimeoutMs,
    workflowRunsPanelByThreadId: workflowWorkspaceController.workflowRunsPanelByThreadId,
    workflowRunTotalLimitMode: input.workflowRunTotalLimitMode,
    workflowSourceDrafts: workflowWorkspaceController.workflowSourceDrafts,
    workflowThreadChatMessagesByThreadId: workflowThreadController.workflowThreadChatMessagesByThreadId,
    workflowThreadComposerBusy: workflowThreadController.workflowThreadComposerBusy,
    workflowThreadComposerDrafts: workflowThreadController.workflowThreadComposerDrafts,
    workflowThreadPlanEditActivityByThreadId: workflowThreadController.workflowThreadPlanEditActivityByThreadId,
    workflowThreadSessionBusy: workflowThreadController.workflowThreadSessionBusy,
    workflowVersions: workflowDashboardController.workflowVersions,
    workspacePath: input.workspacePath,
    actions: {
      answerWorkflowDiscoveryQuestion: workflowDiscoveryController.answerWorkflowDiscoveryQuestion,
      cancelWorkflowRun: workflowArtifactController.cancelWorkflowRun,
      clearWorkflowSourceDraft: workflowWorkspaceController.clearWorkflowSourceDraft,
      compileWorkflowThreadPreview: workflowDiscoveryController.compileWorkflowThreadPreview,
      copyWorkflowCompileFailureReport: workflowDiscoveryController.copyWorkflowCompileFailureReport,
      debugRewriteWorkflowRun: workflowArtifactController.debugRewriteWorkflowRun,
      focusScheduleHistory: scheduleController.focusScheduleHistory,
      focusWorkflowRequestEditor: workflowDiscoveryController.focusWorkflowRequestEditor,
      onCreateWorkflowReviewSchedule: (targetKind, targetId) =>
        scheduleController.createWorkflowReviewSchedule(targetKind, targetId, input.selectedWorkflowAgentArtifact),
      onCreateWorkflowScheduleGrant: (thread, schedule) => scheduleController.createWorkflowScheduleGrant(thread, schedule),
      onOpenMediaModal: input.actions.onOpenMediaModal,
      onRevokePermissionGrant: input.actions.onRevokePermissionGrant,
      onRevokePermissionGrantIds: input.actions.onRevokePermissionGrantIds,
      onScheduleEnabledChange: scheduleController.setScheduleEnabled,
      onScheduleExpressionChange: scheduleController.setScheduleExpression,
      onSchedulePresetChange: scheduleController.setSchedulePreset,
      onSelectPane: input.actions.onSelectPane,
      onSetExpandedScheduleHistoryId: scheduleController.setExpandedScheduleHistoryId,
      onSetScheduleTarget: scheduleController.setScheduleTarget,
      onWorkflowRunIdleTimeoutMsChange: input.actions.onWorkflowRunIdleTimeoutMsChange,
      onWorkflowRunTotalLimitModeChange: input.actions.onWorkflowRunTotalLimitModeChange,
      openWorkflowCompileDiagnostics: workflowDiscoveryController.openWorkflowCompileDiagnostics,
      openWorkflowPanelFromTranscript: input.actions.openWorkflowPanelFromTranscript,
      openWorkflowPersistentStatusTarget: input.actions.openWorkflowPersistentStatusTarget,
      openWorkflowRunDetail: workflowDashboardController.openWorkflowRunDetail,
      prepareWorkflowThreadSession: workflowThreadController.prepareWorkflowThreadSession,
      recoverWorkflowRun: workflowArtifactController.recoverWorkflowRun,
      rejectWorkflowConnectorGrant: workflowArtifactController.rejectWorkflowConnectorGrant,
      removeWorkflowConnectorScope: workflowArtifactController.removeWorkflowConnectorScope,
      resetWorkflowExplorationBudget: workflowDiscoveryController.resetWorkflowExplorationBudget,
      revalidateWorkflowArtifactPreview: workflowArtifactController.revalidateWorkflowArtifactPreview,
      restartWorkflowDiscoveryThread: workflowDiscoveryController.restartWorkflowDiscoveryThread,
      resolveWorkflowApproval: workflowArtifactController.resolveWorkflowApproval,
      resolveWorkflowDiscoveryAccessRequest: workflowDiscoveryController.resolveWorkflowDiscoveryAccessRequest,
      resolveWorkflowRevisionProposal: workflowArtifactController.resolveWorkflowRevisionProposal,
      reviewWorkflowArtifact: workflowArtifactController.reviewWorkflowArtifact,
      runWorkflowArtifact: workflowArtifactController.runWorkflowArtifact,
      runWorkflowExplorationForThread: workflowDiscoveryController.runWorkflowExplorationForThread,
      saveWorkflowArtifactSource: workflowArtifactController.saveWorkflowArtifactSource,
      sendWorkflowThreadComposer: workflowThreadController.sendWorkflowThreadComposer,
      setSelectedWorkflowGraphNodeId: workflowWorkspaceController.setSelectedWorkflowGraphNodeId,
      setWorkflowArtifactPanel: workflowWorkspaceController.setWorkflowArtifactPanel,
      setWorkflowBuildPanel: workflowWorkspaceController.setWorkflowBuildPanel,
      setWorkflowDiscoveryAnswers: workflowDiscoveryController.setWorkflowDiscoveryAnswers,
      setWorkflowRequestRestartDrafts: workflowDiscoveryController.setWorkflowRequestRestartDrafts,
      setWorkflowRunsPanel: workflowWorkspaceController.setWorkflowRunsPanel,
      setWorkflowSourceDraft: workflowWorkspaceController.setWorkflowSourceDraft,
      setWorkflowThreadComposerDrafts: workflowThreadController.setWorkflowThreadComposerDrafts,
      skipWorkflowExplorationForThread: workflowDiscoveryController.skipWorkflowExplorationForThread,
      startWorkflowArtifactRevision: workflowDiscoveryController.startWorkflowArtifactRevision,
      updateWorkflowConnectorAccount: workflowArtifactController.updateWorkflowConnectorAccount,
      updateWorkflowConnectorRetention: workflowArtifactController.updateWorkflowConnectorRetention,
      updateWorkflowExplorationBudget: workflowDiscoveryController.updateWorkflowExplorationBudget,
      workflowArtifactRunBlocked: input.actions.workflowArtifactRunBlocked,
      workflowAuditReportPreview: input.actions.workflowAuditReportPreview,
      workflowExplorationBudgetsForThread: workflowDiscoveryController.workflowExplorationBudgetsForThread,
      workflowRunLimitOverridesForArtifact: workflowArtifactController.runLimitsForArtifact,
    },
  });
}
