import type { Dispatch, SetStateAction } from "react";
import { WorkflowSplitHandle } from "./AutomationsWorkflowPanelRouting";
import type { AutomationFolderSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionMode } from "../../shared/permissionTypes";
import type {
  OrchestrationRun,
  OrchestrationTask,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowCompileProgress,
  WorkflowDiscoveryProgress,
  WorkflowExplorationProgress,
  WorkflowGraphNode,
  WorkflowRecordingLibraryEntry,
  WorkflowRunDetail,
  WorkflowRunSummary,
} from "../../shared/workflowTypes";
import { createAutomationsWorkflowAgentPaneRenderers } from "./AutomationsWorkflowAgentPaneRenderers";
import type { createAutomationsLocalTaskPaneRenderers } from "./AutomationsLocalTaskPaneRenderers";
import type { useAutomationsLocalTaskController } from "./AutomationsLocalTaskController";
import { createAutomationsSchedulePaneRenderers } from "./AutomationsSchedulePaneRenderers";
import type { useAutomationScheduleController } from "./AutomationsScheduleController";
import type { useAutomationsWorkflowArtifactController } from "./AutomationsWorkflowArtifactController";
import {
  workflowArtifactPanelRenderers,
  type WorkflowArtifactPanelRenderers,
} from "./AutomationsWorkflowArtifactInspectorViews";
import type { useAutomationsWorkflowDashboardController } from "./AutomationsWorkflowDashboardController";
import type { useAutomationsWorkflowDiscoveryController } from "./AutomationsWorkflowDiscoveryController";
import type { useWorkflowLabController } from "./AutomationsWorkflowLabController";
import type { useAutomationsWorkflowRecordingLibraryController } from "./AutomationsWorkflowRecordingLibraryController";
import type { useAutomationsWorkflowThreadController } from "./AutomationsWorkflowThreadController";
import {
  createAutomationsWorkflowThreadPaneRenderersForWorkspace,
  type AutomationsWorkflowThreadPaneRendererAdapterInput,
} from "./AutomationsWorkflowThreadPaneRendererAdapter";
import type { useAutomationsWorkflowWorkspaceController } from "./AutomationsWorkflowWorkspaceController";
import {
  createAutomationsWorkspaceContentRenderers,
  type AutomationsWorkspaceContentRenderersInput,
} from "./AutomationsWorkspaceContentRenderers";
import type { AutomationPane } from "./AutomationsWorkspaceShellViews";
import type { WorkflowRunTotalLimitMode } from "./workflowRunLimitsUiModel";

type LocalTaskPaneRenderers = ReturnType<typeof createAutomationsLocalTaskPaneRenderers>;
type LocalTaskController = ReturnType<typeof useAutomationsLocalTaskController>;
type ScheduleController = ReturnType<typeof useAutomationScheduleController>;
type WorkflowArtifactController = ReturnType<typeof useAutomationsWorkflowArtifactController>;
type WorkflowDashboardController = ReturnType<typeof useAutomationsWorkflowDashboardController>;
type WorkflowDiscoveryController = ReturnType<typeof useAutomationsWorkflowDiscoveryController>;
type WorkflowLabController = ReturnType<typeof useWorkflowLabController>;
type WorkflowRecordingLibraryController = ReturnType<typeof useAutomationsWorkflowRecordingLibraryController>;
type WorkflowThreadController = ReturnType<typeof useAutomationsWorkflowThreadController>;
type WorkflowWorkspaceController = ReturnType<typeof useAutomationsWorkflowWorkspaceController>;

type WorkflowRecorderPaneSurface = {
  disabledStartTitle: string;
  homeExplainer: string[];
  legacyCompilerEnabled: boolean;
  legacyHidden: Parameters<typeof createAutomationsWorkflowAgentPaneRenderers>[0]["surface"]["legacyHidden"];
  newWorkflowLabel: string;
  primaryCreateLabel: string;
  startPane: Parameters<typeof createAutomationsWorkflowAgentPaneRenderers>[0]["surface"]["startPane"];
};

type AutomationsPaneTooltips = {
  auditPreview: string;
  autoDispatch: string;
  connectorGrants: string;
  localTasks: string;
  recentRuns: string;
  reviewQueue: string;
  schedules: string;
  workflowAgent: string;
  workflowLab: string;
};

export type AutomationsWorkspacePaneRenderersInput = {
  activePane: AutomationPane;
  activeThreadId?: string;
  allAutomationThreads: AutomationThreadSummary[];
  allTaskRuns: OrchestrationRun[];
  artifactById: ReadonlyMap<string, WorkflowArtifactSummary>;
  automationPluginRegistry: Parameters<typeof workflowArtifactPanelRenderers>[0]["state"]["automationPluginRegistry"];
  automationThreadRouteDetail?: (thread: AutomationThreadSummary) => string | undefined;
  folders: AutomationFolderSummary[];
  localTaskPaneRenderers: LocalTaskPaneRenderers;
  orchestrationTasks: OrchestrationTask[];
  permissionAudit: PermissionAuditEntry[];
  permissionGrantRevoking?: string;
  permissionGrants: AmbientPermissionGrant[];
  permissionMode: PermissionMode;
  selectedAutomationRun?: AutomationsWorkspaceContentRenderersInput["selectedThreadDetail"]["selectedAutomationRun"];
  selectedArtifact?: WorkflowArtifactSummary;
  selectedArtifactThreadRoute?: AutomationsWorkspaceContentRenderersInput["selectedThreadDetail"]["selectedArtifactThreadRoute"];
  selectedArtifactWorkflowThread?: WorkflowAgentThreadSummary;
  selectedTask?: OrchestrationTask;
  selectedThread?: AutomationThreadSummary;
  selectedWorkflowAgentArtifact?: WorkflowArtifactSummary;
  selectedWorkflowAgentDetail?: WorkflowRunDetail;
  selectedWorkflowAgentSourceNode?: WorkflowGraphNode;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  selectedWorkflowRecording?: WorkflowRecordingLibraryEntry;
  surface: WorkflowRecorderPaneSurface;
  tooltips: AutomationsPaneTooltips;
  visibleTaskRuns: OrchestrationRun[];
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowAgentThreadByArtifactId: ReadonlyMap<string, WorkflowAgentThreadSummary>;
  workflowAgentThreadById: ReadonlyMap<string, WorkflowAgentThreadSummary>;
  workflowBusy?: string;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowConnectorAccounts: Parameters<typeof workflowArtifactPanelRenderers>[0]["state"]["workflowConnectorAccounts"];
  workflowDiscoveryProgress?: WorkflowDiscoveryProgress;
  workflowError?: string;
  workflowExplorationProgressByThreadId: Record<string, WorkflowExplorationProgress | undefined>;
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  workflowRunIdleTimeoutMs: number;
  workflowRunTotalLimitMode: WorkflowRunTotalLimitMode;
  workflowRuns: WorkflowRunSummary[];
  workspacePath: string;
  controllers: {
    localTaskController: LocalTaskController;
    scheduleController: ScheduleController;
    workflowArtifactController: WorkflowArtifactController;
    workflowDashboardController: WorkflowDashboardController;
    workflowDiscoveryController: WorkflowDiscoveryController;
    workflowLabController: WorkflowLabController;
    workflowRecordingLibraryController: WorkflowRecordingLibraryController;
    workflowThreadController: WorkflowThreadController;
    workflowWorkspaceController: WorkflowWorkspaceController;
  };
  actions: {
    onArchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
    onEditWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
    onMoveThread: (threadId: string, folderId: string) => Promise<void>;
    onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
    onOpenRunThread: (threadId: string, workspacePath?: string) => Promise<void>;
    onOpenThread: (thread: AutomationThreadSummary) => void;
    onOpenWorkflowArtifactThread: (artifact: WorkflowArtifactSummary) => void;
    openWorkflowPanelFromTranscript: AutomationsWorkflowThreadPaneRendererAdapterInput["actions"]["openWorkflowPanelFromTranscript"];
    openWorkflowPersistentStatusTarget: AutomationsWorkflowThreadPaneRendererAdapterInput["actions"]["openWorkflowPersistentStatusTarget"];
    onPreviewLocalPath: (path: string) => void;
    onPreviewPath: (path: string) => void;
    onRestoreWorkflowRecordingVersion: (id: string, version: number) => Promise<void>;
    onRevokePermissionGrant: (id: string) => Promise<void>;
    onRevokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
    onSelectPane: (pane: AutomationPane) => void;
    onSelectWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
    onSetWorkflowRecordingEnabled: (id: string, enabled: boolean) => Promise<void>;
    onStartWorkflowRecording: (goal: string) => Promise<boolean>;
    onUnarchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
    onWorkflowLibraryIncludeArchivedChange: (includeArchived: boolean) => void;
    onWorkflowRunIdleTimeoutMsChange: (idleTimeoutMs: number) => void;
    onWorkflowRunTotalLimitModeChange: (mode: WorkflowRunTotalLimitMode) => void;
    setWorkflowBusy: Dispatch<SetStateAction<string | undefined>>;
    setWorkflowError: Dispatch<SetStateAction<string | undefined>>;
    workflowArtifactRunBlocked: (artifact: WorkflowArtifactSummary) => boolean;
    workflowAuditReportPreview: (value: string | undefined) => string;
  };
  workflowLibraryIncludeArchived: boolean;
};

export function createAutomationsWorkspacePaneRenderers(input: AutomationsWorkspacePaneRenderersInput) {
  const {
    localTaskController,
    scheduleController,
    workflowArtifactController,
    workflowDashboardController,
    workflowDiscoveryController,
    workflowLabController,
    workflowRecordingLibraryController,
    workflowThreadController,
    workflowWorkspaceController,
  } = input.controllers;

  function renderWorkflowSplitHandle() {
    return (
      <WorkflowSplitHandle
        splitPercent={workflowWorkspaceController.workflowSplitPercent}
        onSplitPercentChange={workflowWorkspaceController.setWorkflowSplitPercent}
      />
    );
  }

  let workflowArtifactPanels: WorkflowArtifactPanelRenderers;
  const {
    renderWorkflowDiscoveryThread,
    renderWorkflowPersistentDiagramPane,
    renderWorkflowThreadDetail,
    renderWorkflowThreadRunsPane,
  } = createAutomationsWorkflowThreadPaneRenderersForWorkspace({
    activeThreadId: input.activeThreadId,
    artifactById: input.artifactById,
    automationPluginRegistry: input.automationPluginRegistry,
    getWorkflowArtifactPanels: () => workflowArtifactPanels,
    permissionAudit: input.permissionAudit,
    permissionGrantRevoking: input.permissionGrantRevoking,
    permissionGrants: input.permissionGrants,
    permissionMode: input.permissionMode,
    renderWorkflowSplitHandle,
    selectedWorkflowAgentArtifact: input.selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail: input.selectedWorkflowAgentDetail,
    selectedWorkflowAgentSourceNode: input.selectedWorkflowAgentSourceNode,
    selectedWorkflowAgentThread: input.selectedWorkflowAgentThread,
    selectedWorkflowGraphNodeId: workflowWorkspaceController.selectedWorkflowGraphNodeId,
    tooltips: {
      auditPreview: input.tooltips.auditPreview,
      connectorGrants: input.tooltips.connectorGrants,
      reviewQueue: input.tooltips.reviewQueue,
    },
    workflowBusy: input.workflowBusy,
    workflowCompileProgress: input.workflowCompileProgress,
    workflowConnectorAccounts: input.workflowConnectorAccounts,
    workflowDiscoveryProgress: input.workflowDiscoveryProgress,
    workflowError: input.workflowError,
    workflowExplorationProgressByThreadId: input.workflowExplorationProgressByThreadId,
    workflowRunIdleTimeoutMs: input.workflowRunIdleTimeoutMs,
    workflowRunTotalLimitMode: input.workflowRunTotalLimitMode,
    workspacePath: input.workspacePath,
    controllers: {
      scheduleController,
      workflowArtifactController,
      workflowDashboardController,
      workflowDiscoveryController,
      workflowThreadController,
      workflowWorkspaceController,
    },
    actions: {
      onOpenMediaModal: input.actions.onOpenMediaModal,
      onRevokePermissionGrant: input.actions.onRevokePermissionGrant,
      onRevokePermissionGrantIds: input.actions.onRevokePermissionGrantIds,
      onSelectPane: input.actions.onSelectPane,
      onWorkflowRunIdleTimeoutMsChange: input.actions.onWorkflowRunIdleTimeoutMsChange,
      onWorkflowRunTotalLimitModeChange: input.actions.onWorkflowRunTotalLimitModeChange,
      openWorkflowPanelFromTranscript: input.actions.openWorkflowPanelFromTranscript,
      openWorkflowPersistentStatusTarget: input.actions.openWorkflowPersistentStatusTarget,
      workflowAuditReportPreview: input.actions.workflowAuditReportPreview,
      workflowArtifactRunBlocked: input.actions.workflowArtifactRunBlocked,
    },
  });

  const { renderLegacyWorkflowHiddenPane, renderWorkflowAgentPane, renderWorkflowLabHomePane, renderWorkflowRecordingPlaybookPane } =
    createAutomationsWorkflowAgentPaneRenderers({
      localTaskPaneRenderers: input.localTaskPaneRenderers,
      selectedWorkflowAgentArtifact: input.selectedWorkflowAgentArtifact,
      selectedWorkflowAgentThread: input.selectedWorkflowAgentThread,
      selectedWorkflowRecording: input.selectedWorkflowRecording,
      surface: {
        disabledStartTitle: input.surface.disabledStartTitle,
        legacyCompilerEnabled: input.surface.legacyCompilerEnabled,
        legacyHidden: input.surface.legacyHidden,
        primaryCreateLabel: input.surface.primaryCreateLabel,
        startPane: input.surface.startPane,
        workflowAgentTooltip: input.tooltips.workflowAgent,
        workflowLabTooltip: input.tooltips.workflowLab,
      },
      workflowBusy: input.workflowBusy,
      workflowCompileProgress: input.workflowCompileProgress,
      workflowDiscoveryBusy: workflowDiscoveryController.workflowDiscoveryBusy,
      workflowError: input.workflowError,
      workflowLabBusy: workflowLabController.workflowLabBusy,
      workflowLabGoal: workflowLabController.workflowLabGoal,
      workflowLabRun: workflowLabController.workflowLabRun,
      workflowLabStatus: workflowLabController.workflowLabStatus,
      workflowRecordingExportBusyThreadId: workflowRecordingLibraryController.workflowRecordingExportBusyThreadId,
      workflowRecordingExportStatus: workflowRecordingLibraryController.workflowRecordingExportStatus,
      workflowRecordingLibrary: input.workflowRecordingLibrary,
      workflowRequest: workflowDiscoveryController.workflowRequest,
      workflowRequestRef: workflowDiscoveryController.workflowRequestRef,
      workflowRevisions: workflowDashboardController.workflowRevisions,
      workflowRevisionSource: workflowDiscoveryController.workflowRevisionSource,
      clearFocusedSchedule: scheduleController.clearFocusedSchedule,
      clearWorkflowRevisionDraft: workflowDiscoveryController.clearWorkflowRevisionDraft,
      compileWorkflowPreview: workflowDiscoveryController.compileWorkflowPreview,
      copyWorkflowCompileFailureReport: workflowDiscoveryController.copyWorkflowCompileFailureReport,
      createWorkflowLabRunForPlaybook: workflowLabController.createRunForPlaybook,
      createWorkflowSample: workflowDiscoveryController.createWorkflowSample,
      exportWorkflowRecordingPlaybookSession: workflowRecordingLibraryController.exportWorkflowRecordingPlaybookSession,
      focusWorkflowRequestEditor: workflowDiscoveryController.focusWorkflowRequestEditor,
      loadWorkflowDashboard: workflowDashboardController.loadWorkflowDashboard,
      onArchiveWorkflowRecordingPlaybook: input.actions.onArchiveWorkflowRecordingPlaybook,
      onEditWorkflowRecordingPlaybook: input.actions.onEditWorkflowRecordingPlaybook,
      openWorkflowCompileDiagnostics: workflowDiscoveryController.openWorkflowCompileDiagnostics,
      onPreviewLocalPath: input.actions.onPreviewLocalPath,
      onRestoreWorkflowRecordingVersion: input.actions.onRestoreWorkflowRecordingVersion,
      onSelectPane: input.actions.onSelectPane,
      onSelectWorkflowRecordingPlaybook: input.actions.onSelectWorkflowRecordingPlaybook,
      onSetWorkflowRecordingEnabled: input.actions.onSetWorkflowRecordingEnabled,
      onStartWorkflowRecording: input.actions.onStartWorkflowRecording,
      onUnarchiveWorkflowRecordingPlaybook: input.actions.onUnarchiveWorkflowRecordingPlaybook,
      renderWorkflowDiscoveryThread,
      renderWorkflowThreadDetail,
      setScheduleTarget: scheduleController.setScheduleTarget,
      setWorkflowBusy: input.actions.setWorkflowBusy,
      setWorkflowError: input.actions.setWorkflowError,
      setWorkflowLabGoal: workflowLabController.setWorkflowLabGoal,
      setWorkflowRequest: workflowDiscoveryController.setWorkflowRequest,
      startWorkflowDiscoveryFromRequest: workflowDiscoveryController.startWorkflowDiscoveryFromRequest,
      startWorkflowLabRun: workflowLabController.startRun,
      stopWorkflowLabRun: workflowLabController.stopRun,
      adoptWorkflowLabBestVariant: workflowLabController.adoptBestVariant,
    });

  const schedulePaneRenderers = createAutomationsSchedulePaneRenderers({
    activeThreadId: input.activeThreadId,
    artifactById: input.artifactById,
    folders: input.folders,
    localTaskPaneRenderers: input.localTaskPaneRenderers,
    orchestrationTasks: input.orchestrationTasks,
    permissionAudit: input.permissionAudit,
    permissionGrants: input.permissionGrants,
    permissionMode: input.permissionMode,
    renderWorkflowPersistentDiagramPane,
    renderWorkflowSplitHandle,
    scheduleController,
    selectedWorkflowAgentArtifact: input.selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail: input.selectedWorkflowAgentDetail,
    selectedWorkflowAgentThread: input.selectedWorkflowAgentThread,
    tooltips: {
      autoDispatch: input.tooltips.autoDispatch,
      schedules: input.tooltips.schedules,
    },
    workflowAgentFolders: input.workflowAgentFolders,
    workflowAgentThreadByArtifactId: input.workflowAgentThreadByArtifactId,
    workflowAgentThreadById: input.workflowAgentThreadById,
    workflowBusy: input.workflowBusy,
    workflowCompileProgress: input.workflowCompileProgress,
    workflowCompileThreadId: workflowDiscoveryController.workflowCompileThreadId,
    workflowDashboard: workflowDashboardController.workflowDashboard,
    workflowDiscoveryBusy: workflowDiscoveryController.workflowDiscoveryBusy,
    workflowDiscoveryLayoutStyle: workflowWorkspaceController.workflowDiscoveryLayoutStyle,
    workflowRecordingLibrary: input.workflowRecordingLibrary,
    workflowRunIdleTimeoutMs: input.workflowRunIdleTimeoutMs,
    workflowRunTotalLimitMode: input.workflowRunTotalLimitMode,
    workflowVersions: workflowDashboardController.workflowVersions,
    workspacePath: input.workspacePath,
    actions: {
      onOpenRunThread: input.actions.onOpenRunThread,
      onSelectPane: input.actions.onSelectPane,
      openWorkflowPersistentStatusTarget: input.actions.openWorkflowPersistentStatusTarget,
      openWorkflowRunDetail: workflowDashboardController.openWorkflowRunDetail,
      runWorkflowArtifact: workflowArtifactController.runWorkflowArtifact,
      workflowRunLimitOverridesForArtifact: workflowArtifactController.runLimitsForArtifact,
    },
  });

  workflowArtifactPanels = workflowArtifactPanelRenderers({
    state: workflowArtifactPanelState(input),
    actions: {
      onWorkflowRunIdleTimeoutChange: input.actions.onWorkflowRunIdleTimeoutMsChange,
      onWorkflowRunTotalLimitModeChange: input.actions.onWorkflowRunTotalLimitModeChange,
      onWorkflowConnectorAccountChange: workflowArtifactController.updateWorkflowConnectorAccount,
      onWorkflowConnectorRetentionChange: workflowArtifactController.updateWorkflowConnectorRetention,
      onRemoveWorkflowConnectorScope: workflowArtifactController.removeWorkflowConnectorScope,
      onRejectWorkflowConnectorGrant: workflowArtifactController.rejectWorkflowConnectorGrant,
      onRevokePermissionGrantIds: input.actions.onRevokePermissionGrantIds,
      onRevokePermissionGrant: input.actions.onRevokePermissionGrant,
      onOpenRunDetail: workflowDashboardController.openWorkflowRunDetail,
      onCancelRun: workflowArtifactController.cancelWorkflowRun,
      onRunArtifact: workflowArtifactController.runWorkflowArtifact,
      runLimitsForArtifact: workflowArtifactController.runLimitsForArtifact,
      onCloseRunConsole: () => {
        workflowDashboardController.workflowDetailRunIdRef.current = undefined;
        workflowDashboardController.setWorkflowDetail(undefined);
      },
      onResumeTotalRuntimePause: workflowArtifactController.resumeWorkflowTotalRuntimePause,
      onSelectSourceNode: workflowWorkspaceController.setSelectedWorkflowGraphNodeId,
      onSourceDraftChange: workflowWorkspaceController.setWorkflowSourceDraft,
      onSourceDraftClear: workflowWorkspaceController.clearWorkflowSourceDraft,
      onSourceSave: workflowArtifactController.saveWorkflowArtifactSource,
      onResolveApproval: workflowArtifactController.resolveWorkflowApproval,
      onAnswerRuntimeInput: workflowArtifactController.answerWorkflowRuntimeInput,
      onRevealBrowser: (request) =>
        window.ambientDesktop.revealBrowser(request).catch((error) => {
          input.actions.setWorkflowError(error instanceof Error ? error.message : String(error));
        }),
      onPreviewPath: input.actions.onPreviewPath,
      onPreviewLocalPath: input.actions.onPreviewLocalPath,
      onOpenMediaModal: input.actions.onOpenMediaModal,
      onStartRevision: workflowDiscoveryController.startWorkflowArtifactRevision,
      onResolveRevision: workflowArtifactController.resolveWorkflowRevisionProposal,
      onRestoreVersionForReview: workflowArtifactController.restoreWorkflowVersionForReview,
    },
  });

  const { renderAutomationPane, renderSelectedThreadDetail } = createAutomationsWorkspaceContentRenderers({
    activePane: input.activePane,
    selectedWorkflowRecording: input.selectedWorkflowRecording,
    selectedWorkflowAgentThread: input.selectedWorkflowAgentThread,
    selectedWorkflowAgentArtifact: input.selectedWorkflowAgentArtifact,
    legacyCompilerEnabled: input.surface.legacyCompilerEnabled,
    allAutomationThreads: input.allAutomationThreads,
    allTaskRuns: input.allTaskRuns,
    workflowRuns: input.workflowRuns,
    workflowDetail: workflowDashboardController.workflowDetail,
    reviewTooltip: input.tooltips.reviewQueue,
    routeDetailForThread: input.automationThreadRouteDetail,
    homePane: {
      homeExplainer: input.surface.homeExplainer,
      newWorkflowLabel: input.surface.newWorkflowLabel,
      playbooks: input.workflowRecordingLibrary,
      query: workflowRecordingLibraryController.workflowLibraryQuery,
      includeArchived: input.workflowLibraryIncludeArchived,
      refreshing: workflowRecordingLibraryController.workflowLibraryRefreshing,
      exportBusyThreadId: workflowRecordingLibraryController.workflowRecordingExportBusyThreadId,
      exportStatus: workflowRecordingLibraryController.workflowRecordingExportStatus,
      onQueryChange: workflowRecordingLibraryController.setWorkflowLibraryQuery,
      onIncludeArchivedChange: input.actions.onWorkflowLibraryIncludeArchivedChange,
      onRefresh: workflowRecordingLibraryController.refreshWorkflowRecordingLibraryFromHome,
      onEditPlaybook: input.actions.onEditWorkflowRecordingPlaybook,
      onOpenPlaybook: input.actions.onSelectWorkflowRecordingPlaybook,
      onPreviewLocalPath: input.actions.onPreviewLocalPath,
      onExportPlaybookSession: workflowRecordingLibraryController.exportWorkflowRecordingPlaybookSession,
      onRestoreVersion: input.actions.onRestoreWorkflowRecordingVersion,
      onSetEnabled: input.actions.onSetWorkflowRecordingEnabled,
      onUnarchivePlaybook: input.actions.onUnarchiveWorkflowRecordingPlaybook,
      onArchivePlaybook: input.actions.onArchiveWorkflowRecordingPlaybook,
    },
    selectedThreadDetail: {
      selectedThread: input.selectedThread,
      folders: input.folders,
      selectedAutomationRun: input.selectedAutomationRun,
      selectedArtifact: input.selectedArtifact,
      selectedArtifactThreadRoute: input.selectedArtifactThreadRoute,
      selectedArtifactWorkflowThread: input.selectedArtifactWorkflowThread,
      selectedTask: input.selectedTask,
      visibleTaskRuns: input.visibleTaskRuns,
      startingRunId: localTaskController.startingRunId,
      workflowAgentTooltip: input.tooltips.workflowAgent,
      localTasksTooltip: input.tooltips.localTasks,
      recentRunsTooltip: input.tooltips.recentRuns,
      onMoveThread: input.actions.onMoveThread,
      onOpenRunThread: input.actions.onOpenRunThread,
      onRevealWorkspace: localTaskController.revealOrchestrationWorkspace,
      onOpenWorkflowArtifactThread: input.actions.onOpenWorkflowArtifactThread,
      onUpdateTaskState: localTaskController.updateTaskState,
      onUpdateTaskLabels: localTaskController.updateTaskLabels,
      onStartRun: localTaskController.startOrchestrationRun,
    },
    renderers: {
      localTaskPaneRenderers: input.localTaskPaneRenderers,
      schedulePaneRenderers,
      workflowArtifactPanels,
      renderLegacyWorkflowHiddenPane,
      renderWorkflowAgentPane,
      renderWorkflowLabHomePane,
      renderWorkflowRecordingPlaybookPane,
      renderWorkflowThreadRunsPane,
    },
    actions: {
      onOpenThread: input.actions.onOpenThread,
      onSelectPane: input.actions.onSelectPane,
    },
  });

  return { renderAutomationPane, renderSelectedThreadDetail };
}

function workflowArtifactPanelState(input: AutomationsWorkspacePaneRenderersInput) {
  const { workflowDashboardController, workflowWorkspaceController } = input.controllers;
  return {
    workflowBusy: input.workflowBusy,
    workflowRunIdleTimeoutMs: input.workflowRunIdleTimeoutMs,
    workflowRunTotalLimitMode: input.workflowRunTotalLimitMode,
    permissionGrants: input.permissionGrants,
    permissionAudit: input.permissionAudit,
    activeThreadId: input.activeThreadId,
    workspacePath: input.workspacePath,
    workflowConnectorAccounts: input.workflowConnectorAccounts,
    automationPluginRegistry: input.automationPluginRegistry,
    permissionGrantRevoking: input.permissionGrantRevoking,
    workflowSourceDrafts: workflowWorkspaceController.workflowSourceDrafts,
    selectedWorkflowAgentArtifactId: input.selectedWorkflowAgentArtifact?.id,
    selectedWorkflowAgentSourceNode: input.selectedWorkflowAgentSourceNode,
    selectedWorkflowAgentThreadNodes: input.selectedWorkflowAgentThread?.graph?.nodes,
    workflowVersions: workflowDashboardController.workflowVersions,
    workflowRevisions: workflowDashboardController.workflowRevisions,
    runConsoleRef: workflowDashboardController.workflowRunConsoleRef,
  };
}
