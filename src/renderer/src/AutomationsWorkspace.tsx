import { useEffect, useMemo, useState } from "react";
import type { AutomationFolderSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type { DesktopState } from "../../shared/desktopTypes";
import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditEntry,
  PermissionMode,
} from "../../shared/permissionTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { ThinkingLevel } from "../../shared/threadTypes";
import type {
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowCompileProgress,
  WorkflowDiscoveryProgress,
  WorkflowExplorationProgress,
  WorkflowRecordingLibraryEntry,
  WorkflowRevisionSummary,
  WorkflowRunDetail,
  WorkflowRunSummary,
} from "../../shared/workflowTypes";
import { createAutomationsWorkflowAgentPaneRenderers } from "./AutomationsWorkflowAgentPaneRenderers";
import { createAutomationsLocalTaskPaneRenderers } from "./AutomationsLocalTaskPaneRenderers";
import { useAutomationsLocalTaskController } from "./AutomationsLocalTaskController";
import { WorkflowRunCards } from "./AutomationsWorkflowRuntimeViews";
import { automationScheduleTargetSourcesModel, useAutomationScheduleController } from "./AutomationsScheduleController";
import { AutomationSchedulesFallbackPane, WorkflowFocusedSchedulesPane, workflowSchedulesPaneRouteModel } from "./AutomationsScheduleViews";
import { AutomationSelectedThreadDetailView } from "./AutomationsThreadDetailViews";
import { useAutomationsWorkflowArtifactController } from "./AutomationsWorkflowArtifactController";
import { workflowArtifactPanelRenderers } from "./AutomationsWorkflowArtifactInspectorViews";
import { WorkflowBuildWorkspace, workflowBuildWorkspaceViewModel } from "./AutomationsWorkflowBuildViews";
import { useAutomationsWorkflowDashboardController } from "./AutomationsWorkflowDashboardController";
import { WorkflowAgentDiagramPane } from "./AutomationsWorkflowDiagramViews";
import { latestWorkflowRunForArtifact, useAutomationsWorkflowDiscoveryController } from "./AutomationsWorkflowDiscoveryController";
import {
  WorkflowDiscoveryThreadWorkspace,
  workflowDiscoveryThreadWorkspaceViewModel,
  WorkflowRequestEditor,
} from "./AutomationsWorkflowDiscoveryViews";
import { workflowConnectorAccountsByConnector } from "./AutomationsWorkflowEvidenceViews";
import { WorkflowExplorationPanel } from "./AutomationsWorkflowExplorationViews";
import { useWorkflowLabController } from "./AutomationsWorkflowLabController";
import { createAutomationsWorkflowNavigationController } from "./AutomationsWorkflowNavigationController";
import { WorkflowSplitHandle } from "./AutomationsWorkflowPanelRouting";
import { useAutomationsWorkflowRecordingLibraryController } from "./AutomationsWorkflowRecordingLibraryController";
import { WorkflowReviewWorkspace } from "./AutomationsWorkflowReviewViews";
import { WorkflowFocusedRunsPane } from "./AutomationsWorkflowRuntimeViews";
import { WorkflowThreadComposerView } from "./AutomationsWorkflowThreadComposerViews";
import { useAutomationsWorkflowThreadController } from "./AutomationsWorkflowThreadController";
import { useAutomationsWorkflowWorkspaceController } from "./AutomationsWorkflowWorkspaceController";
import {
  AutomationsWorkspaceHomePane,
  AutomationsWorkspaceRunsReviewsPane,
  AutomationsWorkspaceTabsView,
} from "./AutomationsWorkspaceHomeViews";
import {
  AutomationPaneRouter,
  automationWorkspaceActivePaneTooltip,
  AutomationWorkspaceHeader,
  automationWorkspacePaneTitle,
  automationWorkspaceShellModel,
  type AutomationPane,
} from "./AutomationsWorkspaceShellViews";
import { useAutomationsWorkspaceSurfaceController } from "./AutomationsWorkspaceSurfaceController";
import { automationWorkspaceSelectionModel } from "./automationWorkspaceSelectionModel";
import "./styles.css";
import { workflowExplorationGateForThread } from "./workflowExplorationGateUiModel";
import { findWorkflowGraphNodeReviewActionTarget } from "./workflowGraphNodeReviewRouting";
import type { WorkflowGraphNodeReviewAction } from "./workflowGraphNodeReviewUiModel";
import { workflowRecorderLegacyCompilerEnabled, workflowRecorderSurfaceModel } from "./workflowRecorderUiModel";
import { workflowReviewArtifactRunBlocked, workflowReviewWorkspaceViewModel } from "./workflowReviewUiModel";
import {
  DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
  DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";
import { workflowThreadTranscriptCards, type WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";

export { AutomationHeadingLabel } from "./AutomationsHeading";
export {
  compareKanbanTasks,
  LocalTasksPane,
  taskNextState,
  taskPauseStateOptions,
  taskPreviousState,
  taskPrimaryStateOptions,
  taskStateOptions,
  taskTriggerLabel,
  taskUserLabels,
} from "./AutomationsLocalTaskBoard";
export {
  proofCspRenderableImageSrc,
  proofEvidenceFileHref,
  proofEvidenceLinkTarget,
  ProofEvidencePathLink,
  ProofOfWorkPreview,
  ProofPacketInspectionPanel,
  ProofPreviewImage,
  proofPreviewImageLocalPath,
  ProofRichText,
  ProofVisualEvidenceGallery,
  ProofVisualEvidenceIcon,
  type ProofEvidenceLinkTarget,
  type ProofPreviewImageState,
} from "./AutomationsProofPreviewViews";
export {
  AutoDispatchStatusView,
  AutoDispatchToggle,
  formatAutoDispatchStartedRun,
  formatDelay,
  formatOrchestrationRunStatus,
  formatRunDuration,
  isRestartInterruptedLocalTaskRun,
  LocalTaskRunList,
  orchestrationRunActionLabel,
  orchestrationTimelineEntries,
  PrepareResultView,
  RunTimeline,
  terminalRunLabel,
} from "./AutomationsRunHistory";
export { useRunningClock } from "./AutomationsRunningClock";
export {
  AutomationSchedulesPane,
  datetimeLocalValueFromIso,
  defaultScheduleReplacementLocal,
  isoFromDatetimeLocalValue,
  WorkflowScheduleHistoryPanel,
  WorkflowScheduleOccurrenceEditor,
  workflowSchedulesPaneRouteModel,
  WorkflowSchedulesWorkspace,
  type WorkflowScheduleOccurrenceEditorState,
} from "./AutomationsScheduleViews";
export { AutomationSelectedThreadDetailView } from "./AutomationsThreadDetailViews";
export { WorkflowManifestPanel, WorkflowPermissionsPanel, WorkflowVersionHistoryPanel } from "./AutomationsWorkflowArtifactInspectorViews";
export { WorkflowBuildWorkspace } from "./AutomationsWorkflowBuildViews";
export {
  WorkflowAgentDiagramCanvas,
  WorkflowAgentDiagramPane,
  WorkflowAgentEdge,
  workflowAgentEdgeTypes,
  WorkflowAgentNode,
  workflowAgentNodeTypes,
  workflowDiagramNodeBounds,
  workflowGraphSnapshotWithActiveNode,
  workflowRecoveryBusyLabel,
} from "./AutomationsWorkflowDiagramViews";
export {
  discoveryAccessResponseLabel,
  formatDiscoveryCapability,
  formatWorkflowTimeoutMode,
  WorkflowDiscoveryActivity,
  WorkflowDiscoveryContextReview,
  workflowDiscoveryLiveStatusSubtitle,
  workflowDiscoveryLiveStatusTitle,
  workflowDiscoveryProgressDetail,
  WorkflowDiscoveryQuestionView,
  WorkflowDiscoverySummary,
  WorkflowDiscoveryThreadWorkspace,
  WorkflowRequestEditor,
  WorkflowRevisionPanel,
} from "./AutomationsWorkflowDiscoveryViews";
export {
  WorkflowAmbientCliCallList,
  WorkflowAmbientCliCapabilityList,
  workflowConnectorAccountsByConnector,
  WorkflowConnectorCallList,
  WorkflowConnectorGrantList,
  WorkflowEventList,
  WorkflowModelCallList,
  WorkflowPluginCapabilityList,
  WorkflowStepList,
} from "./AutomationsWorkflowEvidenceViews";
export { WorkflowExplorationPanel, WorkflowExplorationPreflightView } from "./AutomationsWorkflowExplorationViews";
export { WorkflowLabPanel, workflowLabPanelModel, type WorkflowLabBusy } from "./AutomationsWorkflowLabViews";
export { WorkflowOutputsPanel } from "./AutomationsWorkflowOutputViews";
export {
  WorkflowLabPlaybookLibrarySection,
  WorkflowRecordingPlaybookLibrarySection,
  workflowRecordingPlaybookMatchesQuery,
  WorkflowRecordingPlaybookPane,
} from "./AutomationsWorkflowPlaybookViews";
export { chatExportStatusMessage } from "./AutomationsWorkflowRecordingLibraryController";
export {
  formatWorkflowCompileAuditList,
  workflowCompileActionIcon,
  WorkflowCompileActivity,
  WorkflowCompileAuditInlineCard,
  WorkflowCompileAuditReview,
  workflowCompileAuditRuleIds,
  WorkflowProgramInspector,
  WorkflowReviewEvidenceStrip,
  WorkflowReviewTile,
  WorkflowReviewWorkspace,
} from "./AutomationsWorkflowReviewViews";
export {
  WorkflowFocusedRunsPane,
  WorkflowPersistentStatusView,
  WorkflowRunCards,
  WorkflowRunConsole,
  WorkflowRuntimeInputPanel,
  WorkflowThreadRunsWorkspace,
} from "./AutomationsWorkflowRuntimeViews";
export { WorkflowThreadComposerView } from "./AutomationsWorkflowThreadComposerViews";
export {
  AutomationExplainer,
  AutomationFolderPane,
  AutomationHomePane,
  AutomationHomeStatusGrid,
  automationIndicatorKind,
  AutomationRunsReviewsPane,
  AutomationThreadCardGrid,
  automationThreadStatusGroups,
  WorkflowAgentCompilerStartPane,
  WorkflowLegacyHiddenPane,
  WorkflowRecorderStartPane,
  WorkflowRuntimeBrowserScreenshotPreview,
  WorkflowThreadTranscript,
  type ThreadIndicatorKind,
} from "./AutomationsWorkflowUtilityViews";
export {
  automationWorkspaceActivePaneTooltip,
  AutomationWorkspaceHeader,
  automationWorkspaceHeaderModel,
  automationWorkspacePaneTitle,
  automationWorkspaceProjectSelectionModel,
  automationWorkspaceShellModel,
  AutomationWorkspaceTabs,
  type AutomationPane,
  type AutomationWorkspaceTab,
} from "./AutomationsWorkspaceShellViews";

export const workflowRecorderSurface = workflowRecorderSurfaceModel({
  legacyCompilerEnabled: workflowRecorderLegacyCompilerEnabled(import.meta.env.AMBIENT_LEGACY_WORKFLOW_COMPILER),
});

export const automationHelpText = workflowRecorderSurface.helpText;

export const automationHeadingTooltips = {
  home: workflowRecorderSurface.homeTooltip,
  folders: workflowRecorderSurface.foldersTooltip,
  workflowAgent: workflowRecorderSurface.workflowTooltip,
  localTasks:
    "Local Tasks are project-scoped automation jobs. Prepare next creates runnable workspaces, and auto-dispatch starts eligible prepared runs.",
  workflowLab: "Choose a saved workflow playbook, state the improvement goal, and run bounded Workflow Lab variants.",
  schedules:
    "Schedules define whether automation work runs manually, through auto-dispatch, or on a cron-like cadence once scheduled execution is connected.",
  runsReviews:
    "Runs and Reviews collects active runs, failed runs, workflow approvals, checkpoints, run chats, workspaces, and audit reports.",
  project: "Project is the workspace whose workflow configuration and files the automation will use.",
  triggerMode:
    "Trigger mode tells Ambient whether this work is manual, auto-dispatched when eligible, or intended for a scheduled cadence.",
  autoDispatch:
    "Auto-dispatch checks for ready local tasks on a timer and starts eligible prepared runs. Use the switch to pause or resume it for this workspace.",
  runConsole: "Run Console shows the selected workflow run, including approvals, checkpoints, events, and the generated audit preview.",
  recentRuns: "Recent Runs lists the newest local task runs in the selected automation scope.",
  reviewQueue: "Review Queue contains workflow changes that need approval before an automation can continue.",
  checkpoints: "Checkpoints are resumable workflow state. They let a run skip completed deterministic work after a pause or retry.",
  auditPreview: "Audit Preview summarizes what ran, what tools and connectors were allowed, and the proof collected for the run.",
  connectorGrants:
    "Connector Grants show which external data sources, scopes, operations, and retention policy the workflow is allowed to use.",
} as const;

export function workflowArtifactRunBlocked(artifact: WorkflowArtifactSummary): boolean {
  return workflowReviewArtifactRunBlocked(artifact);
}

export function automationPaneTitle(pane: AutomationPane, folder?: AutomationFolderSummary): string {
  return automationWorkspacePaneTitle(pane, folder, {
    homeTitle: workflowRecorderSurface.homeTitle,
    workflowAgentLabel: workflowRecorderSurface.newWorkflowLabel,
  });
}

export function activePaneTooltip(pane: AutomationPane): string {
  return automationWorkspaceActivePaneTooltip(pane, automationHeadingTooltips);
}

export function AutomationsWorkspace({
  activePane,
  selectedFolder,
  selectedThread,
  selectedWorkflowAgentFolder,
  selectedWorkflowAgentThread,
  selectedWorkflowRecording,
  folders,
  workflowAgentFolders,
  workflowRecordingLibrary,
  activeProjectName,
  activeProjectPath,
  activeThreadId,
  projects,
  orchestrationRevision,
  orchestrationAutoRevision,
  workflowRevision,
  workflowCompileProgress,
  workflowDiscoveryProgress,
  workflowExplorationProgressByThreadId,
  onWorkflowExplorationProgressChanged,
  permissionGrants,
  permissionAudit,
  permissionMode,
  model,
  thinkingLevel,
  permissionGrantRevoking,
  workspacePath,
  onWorkflowCompileProgressReset,
  onWorkflowRevisionChanged,
  onFoldersChanged,
  onWorkflowAgentFoldersChanged,
  onRevokePermissionGrant,
  onRevokePermissionGrantIds,
  onCreateProject,
  onStartWorkflowRecording,
  onSetWorkflowRecordingEnabled,
  onEditWorkflowRecordingPlaybook,
  onArchiveWorkflowRecordingPlaybook,
  onUnarchiveWorkflowRecordingPlaybook,
  onRestoreWorkflowRecordingVersion,
  workflowLibraryIncludeArchived,
  onWorkflowLibraryIncludeArchivedChange,
  onRefreshWorkflowRecordingLibrary,
  onDesktopStateChanged,
  onSelectWorkflowRecordingPlaybook,
  onSelectWorkflowAgentThread,
  onMoveThread,
  onSelectPane,
  onSelectThread,
  onOpenRunThread,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
}: {
  activePane: AutomationPane;
  selectedFolder?: AutomationFolderSummary;
  selectedThread?: AutomationThreadSummary;
  selectedWorkflowAgentFolder?: WorkflowAgentFolderSummary;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  selectedWorkflowRecording?: WorkflowRecordingLibraryEntry;
  folders: AutomationFolderSummary[];
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  activeProjectName: string;
  activeProjectPath: string;
  activeThreadId?: string;
  projects: ProjectSummary[];
  orchestrationRevision: number;
  orchestrationAutoRevision: number;
  workflowRevision: number;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowDiscoveryProgress?: WorkflowDiscoveryProgress;
  workflowExplorationProgressByThreadId: Record<string, WorkflowExplorationProgress | undefined>;
  onWorkflowExplorationProgressChanged: (workflowThreadId: string, progress: WorkflowExplorationProgress) => void;
  permissionGrants: AmbientPermissionGrant[];
  permissionAudit: PermissionAuditEntry[];
  permissionMode: PermissionMode;
  model: string;
  thinkingLevel: ThinkingLevel;
  permissionGrantRevoking?: string;
  workspacePath: string;
  onWorkflowCompileProgressReset: () => void;
  onWorkflowRevisionChanged: () => void;
  onFoldersChanged: (folders: AutomationFolderSummary[]) => void;
  onWorkflowAgentFoldersChanged: (folders: WorkflowAgentFolderSummary[]) => void;
  onRevokePermissionGrant: (id: string) => Promise<void>;
  onRevokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
  onCreateProject: () => Promise<DesktopState | undefined>;
  onStartWorkflowRecording: (goal: string) => Promise<boolean>;
  onSetWorkflowRecordingEnabled: (id: string, enabled: boolean) => Promise<void>;
  onEditWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onArchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
  onUnarchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
  onRestoreWorkflowRecordingVersion: (id: string, version: number) => Promise<void>;
  workflowLibraryIncludeArchived: boolean;
  onWorkflowLibraryIncludeArchivedChange: (includeArchived: boolean) => void;
  onRefreshWorkflowRecordingLibrary: () => Promise<void>;
  onDesktopStateChanged: (state: DesktopState) => void;
  onSelectWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  onMoveThread: (threadId: string, folderId: string) => Promise<void>;
  onSelectPane: (pane: AutomationPane) => void;
  onSelectThread: (thread: AutomationThreadSummary) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => Promise<void>;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const [workflowError, setWorkflowError] = useState<string | undefined>();
  const workspaceSurfaceController = useAutomationsWorkspaceSurfaceController({
    onFoldersChanged,
    onWorkflowAgentFoldersChanged,
  });
  const {
    orchestrationBoard,
    setOrchestrationBoard,
    orchestrationError,
    setOrchestrationError,
    autoDispatchStatus,
    setAutoDispatchStatus,
    automationPluginRegistry,
    refreshAutomationFolders,
    loadAutomationPluginRegistry,
    loadOrchestrationBoard,
    loadAutoDispatchStatus,
  } = workspaceSurfaceController;
  const {
    workflowLabRun,
    workflowLabGoal,
    setWorkflowLabGoal,
    workflowLabBusy,
    workflowLabStatus,
    createRunForPlaybook: createWorkflowLabRunForPlaybook,
    startRun: startWorkflowLabRun,
    stopRun: stopWorkflowLabRun,
    adoptBestVariant: adoptWorkflowLabBestVariant,
  } = useWorkflowLabController({ selectedWorkflowRecording, onDesktopStateChanged });
  const [workflowBusy, setWorkflowBusy] = useState<string | undefined>();
  const [workflowRunIdleTimeoutMs, setWorkflowRunIdleTimeoutMs] = useState(DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS);
  const [workflowRunTotalLimitMode, setWorkflowRunTotalLimitMode] = useState<WorkflowRunTotalLimitMode>(
    DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE,
  );
  const workflowRecordingLibraryController = useAutomationsWorkflowRecordingLibraryController({
    onRefreshWorkflowRecordingLibrary,
    onWorkflowErrorChanged: setWorkflowError,
  });
  const {
    workflowLibraryQuery,
    setWorkflowLibraryQuery,
    workflowLibraryRefreshing,
    workflowRecordingExportStatus,
    workflowRecordingExportBusyThreadId,
    refreshWorkflowRecordingLibraryFromHome,
    exportWorkflowRecordingPlaybookSession,
  } = workflowRecordingLibraryController;
  const workflowWorkspaceController = useAutomationsWorkflowWorkspaceController({
    selectedWorkflowAgentThreadId: selectedWorkflowAgentThread?.id,
  });
  const {
    workflowArtifactPanelByThreadId,
    workflowRunsPanelByThreadId,
    selectedWorkflowGraphNodeId,
    setSelectedWorkflowGraphNodeId,
    workflowSplitPercent,
    setWorkflowSplitPercent,
    workflowDiscoveryLayoutStyle,
    workflowSourceDrafts,
    setWorkflowSourceDraft,
    clearWorkflowSourceDraft,
    setWorkflowArtifactPanel,
    setWorkflowRunsPanel,
    setWorkflowBuildPanel,
  } = workflowWorkspaceController;
  const [taskProjectPath, setTaskProjectPath] = useState(activeProjectPath);
  const scheduleController = useAutomationScheduleController({
    activeThreadId,
    workspacePath,
    createPermissionGrantTargetHash: rendererPermissionGrantTargetHash,
  });
  const localTaskController = useAutomationsLocalTaskController({
    refreshAutomationFolders,
    loadAutoDispatchStatus,
    onOrchestrationBoardChanged: setOrchestrationBoard,
    onOrchestrationErrorChanged: setOrchestrationError,
    onAutoDispatchStatusChanged: setAutoDispatchStatus,
  });
  const {
    scheduleTargetType,
    scheduleTargetId,
    schedulePreset,
    scheduleExpression,
    scheduleEnabled,
    scheduleRunIdleTimeoutMs,
    scheduleRunTotalLimitMode,
    automationSchedules,
    automationScheduleExceptions,
    focusedScheduleId,
    scheduleEditScope,
    scheduleOccurrenceEditor,
    workflowSchedulePanel,
    expandedScheduleHistoryId,
    scheduleBusy,
    scheduleError,
  } = scheduleController;
  const workflowDashboardController = useAutomationsWorkflowDashboardController({
    selectedWorkflowAgentThread,
    workflowRevision,
    workspacePath,
    onWorkflowBusyChanged: setWorkflowBusy,
    onWorkflowErrorChanged: setWorkflowError,
    onWorkflowAgentFoldersChanged,
    onSelectWorkflowAgentThread,
    onWorkflowExplorationProgressChanged,
    onWorkflowArtifactPanelChanged: setWorkflowArtifactPanel,
    onWorkflowRunsPanelChanged: setWorkflowRunsPanel,
    onScheduleFixture: scheduleController.applyScheduleFixture,
  });
  const {
    workflowDashboard,
    setWorkflowDashboard,
    workflowDetail,
    setWorkflowDetail,
    workflowRevisions,
    workflowVersions,
    workflowExplorationTracesByThreadId,
    setWorkflowExplorationTracesByThreadId,
    workflowDetailRunIdRef,
    workflowRunConsoleRef,
    loadWorkflowDashboard,
    loadWorkflowRevisions,
    loadWorkflowVersions,
    loadWorkflowExplorationTraces,
    selectWorkflowAgentThreadForArtifact,
    openWorkflowRunDetail,
  } = workflowDashboardController;
  const workflowDiscoveryController = useAutomationsWorkflowDiscoveryController({
    activeProjectPath,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    workflowAgentFolders,
    workflowRevisions,
    workflowBusy,
    onWorkflowBusyChanged: setWorkflowBusy,
    onWorkflowDashboardChanged: setWorkflowDashboard,
    onWorkflowErrorChanged: setWorkflowError,
    onWorkflowCompileProgressReset,
    refreshAutomationFolders,
    loadWorkflowRevisions,
    loadWorkflowVersions,
    loadWorkflowExplorationTraces,
    onWorkflowAgentFoldersChanged,
    onSelectWorkflowAgentThread,
    onSelectWorkflowAgentThreadForArtifact: selectWorkflowAgentThreadForArtifact,
    onOpenWorkflowRunDetail: openWorkflowRunDetail,
    onWorkflowExplorationTracesChanged: setWorkflowExplorationTracesByThreadId,
    onWorkflowArtifactPanelChanged: setWorkflowArtifactPanel,
  });
  const {
    workflowCompileThreadId,
    workflowDiscoveryBusy,
    workflowDiscoveryAnswers,
    setWorkflowDiscoveryAnswers,
    optimisticWorkflowDiscoveryAnswers,
    workflowRequest,
    setWorkflowRequest,
    workflowRequestRestartDrafts,
    setWorkflowRequestRestartDrafts,
    workflowExplorationSkippedByThreadId,
    workflowRevisionSource,
    workflowRequestRef,
    createWorkflowSample,
    compileWorkflowPreview,
    startWorkflowDiscoveryFromRequest,
    answerWorkflowDiscoveryQuestion,
    restartWorkflowDiscoveryThread,
    resolveWorkflowDiscoveryAccessRequest,
    workflowExplorationBudgetsForThread,
    updateWorkflowExplorationBudget,
    resetWorkflowExplorationBudget,
    runWorkflowExplorationForThread,
    skipWorkflowExplorationForThread,
    compileWorkflowThreadPreview,
    startWorkflowArtifactRevision,
    clearWorkflowRevisionDraft,
    focusWorkflowRequestEditor,
    openWorkflowCompileDiagnostics,
    copyWorkflowCompileFailureReport,
  } = workflowDiscoveryController;
  const workflowArtifactController = useAutomationsWorkflowArtifactController({
    selectedWorkflowAgentThread,
    workflowDetailRunIdRef,
    workflowRunIdleTimeoutMs,
    workflowRunTotalLimitMode,
    onWorkflowBusyChanged: setWorkflowBusy,
    onWorkflowErrorChanged: setWorkflowError,
    onWorkflowDashboardChanged: setWorkflowDashboard,
    onWorkflowDetailChanged: setWorkflowDetail,
    onWorkflowCompileProgressReset,
    refreshAutomationFolders,
    loadWorkflowDashboard,
    loadWorkflowVersions,
    loadWorkflowThreadChatMessages: loadWorkflowThreadChatMessagesForArtifactController,
    onWorkflowRevisionChanged,
    onSelectWorkflowAgentThread,
    onOpenWorkflowRunDetail: openWorkflowRunDetail,
    onWorkflowSourceDraftClear: clearWorkflowSourceDraft,
    workflowArtifactForRecovery,
  });
  const {
    runLimitsForArtifact: workflowRunLimitOverridesForArtifact,
    reviewWorkflowArtifact,
    updateWorkflowConnectorRetention,
    updateWorkflowConnectorAccount,
    rejectWorkflowConnectorGrant,
    removeWorkflowConnectorScope,
    revalidateWorkflowArtifactPreview,
    saveWorkflowArtifactSource,
    runWorkflowArtifact,
    answerWorkflowRuntimeInput,
    resumeWorkflowTotalRuntimePause,
    recoverWorkflowRun,
    debugRewriteWorkflowRun,
    resolveWorkflowRevisionProposal,
    restoreWorkflowVersionForReview,
    cancelWorkflowRun,
    resolveWorkflowApproval,
  } = workflowArtifactController;
  const workflowThreadController = useAutomationsWorkflowThreadController({
    selectedWorkflowAgentThread,
    workflowRevision,
    workflowBusy,
    workflowDiscoveryBusy,
    permissionMode,
    model,
    thinkingLevel,
    refreshAutomationFolders,
    loadWorkflowRevisions,
    loadWorkflowVersions,
    loadWorkflowDashboard,
    onWorkflowErrorChanged: setWorkflowError,
    onSelectWorkflowAgentThread,
    onWorkflowRevisionChanged,
    onAnswerWorkflowRuntimeInput: answerWorkflowRuntimeInput,
    onResumeWorkflowTotalRuntimePause: resumeWorkflowTotalRuntimePause,
    onRecoverWorkflowRun: recoverWorkflowRun,
    onDebugRewriteWorkflowRun: debugRewriteWorkflowRun,
  });
  const {
    workflowThreadComposerDrafts,
    setWorkflowThreadComposerDrafts,
    workflowThreadComposerBusy,
    workflowThreadSessionBusy,
    workflowThreadChatMessagesByThreadId,
    workflowThreadPlanEditActivityByThreadId,
    loadWorkflowThreadChatMessages,
    prepareWorkflowThreadSession,
    sendWorkflowThreadComposer,
  } = workflowThreadController;

  function renderWorkflowSplitHandle() {
    return <WorkflowSplitHandle splitPercent={workflowSplitPercent} onSplitPercentChange={setWorkflowSplitPercent} />;
  }

  useEffect(() => {
    void loadAutomationSurface();
  }, [orchestrationRevision, orchestrationAutoRevision, workflowRevision]);

  const automationSelection = automationWorkspaceSelectionModel({
    folders,
    selectedThread,
    activePane,
    selectedFolder,
    orchestrationBoard,
    workflowDashboard,
    selectedWorkflowAgentThread,
    workflowDetail,
    selectedWorkflowGraphNodeId,
    workflowAgentFolders,
  });
  const {
    allAutomationThreads,
    visibleThreads,
    visibleTasks,
    visibleTaskRuns,
    selectedArtifact,
    selectedTask,
    selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail,
    selectedWorkflowAgentSourceNode,
    selectedAutomationRun,
    workflowRuns,
    allTaskRuns,
    artifactById,
    taskById,
    workflowAgentThreadById,
    workflowAgentThreadByArtifactId,
    selectedArtifactWorkflowThread,
    selectedArtifactThreadRoute,
  } = automationSelection;

  function workflowArtifactForRecovery(artifactId: string): WorkflowArtifactSummary | undefined {
    return selectedWorkflowAgentArtifact?.id === artifactId
      ? selectedWorkflowAgentArtifact
      : workflowDashboard?.artifacts.find((candidate) => candidate.id === artifactId);
  }

  function loadWorkflowThreadChatMessagesForArtifactController(threadId?: string) {
    return loadWorkflowThreadChatMessages(threadId);
  }

  const automationShellModel = automationWorkspaceShellModel({
    activePane,
    selectedFolder,
    selectedWorkflowRecording,
    selectedWorkflowAgentThread,
    selectedThread,
    allAutomationThreads,
    folders,
    projects,
    activeProjectName,
    activeProjectPath,
    taskProjectPath,
    legacyCompilerEnabled: workflowRecorderSurface.legacyCompilerEnabled,
    paneCopy: {
      homeTitle: workflowRecorderSurface.homeTitle,
      workflowAgentLabel: workflowRecorderSurface.newWorkflowLabel,
      tooltips: automationHeadingTooltips,
    },
  });
  const automationHeaderModel = automationShellModel.header;
  const { projectOptions, selectedTaskProjectPath } = automationShellModel.projectSelection;
  useEffect(() => {
    setTaskProjectPath(activeProjectPath);
  }, [activeProjectPath]);
  const workflowConnectorAccounts = useMemo(
    () => workflowConnectorAccountsByConnector(automationPluginRegistry),
    [automationPluginRegistry],
  );

  useEffect(() => {
    if (projectOptions.some((project) => project.path === taskProjectPath)) return;
    setTaskProjectPath(activeProjectPath);
  }, [activeProjectPath, projectOptions, taskProjectPath]);

  async function loadAutomationSurface() {
    await Promise.all([
      loadOrchestrationBoard(),
      loadAutoDispatchStatus(),
      loadWorkflowDashboard(),
      loadAutomationPluginRegistry(),
      scheduleController.loadAutomationSchedules(),
      refreshAutomationFolders(),
    ]);
  }

  const workflowNavigationController = createAutomationsWorkflowNavigationController({
    selection: automationSelection,
    actions: {
      onSelectPane,
      onSelectThread,
      onSelectWorkflowAgentThread,
      selectWorkflowAgentThreadForArtifact,
      setWorkflowArtifactPanel,
      setWorkflowBuildPanel,
      setWorkflowRunsPanel,
      setWorkflowSchedulePanel: scheduleController.setWorkflowSchedulePanel,
    },
  });
  const {
    automationThreadRouteDetail,
    openAutomationThreadCard,
    openWorkflowArtifactThread,
    openWorkflowPanelFromTranscript,
    openWorkflowPersistentStatusTarget,
  } = workflowNavigationController;

  function automationScheduleTargetSources() {
    return automationScheduleTargetSourcesModel({
      workflowRecordingLibrary,
      workflowArtifacts: workflowDashboard?.artifacts ?? [],
      workflowAgentFolders,
      folders,
      tasks: orchestrationBoard?.tasks ?? [],
    });
  }

  async function createProjectForLocalTask() {
    setOrchestrationError(undefined);
    try {
      const next = await onCreateProject();
      if (next) setTaskProjectPath(next.workspace.path);
    } catch (error) {
      setOrchestrationError(error instanceof Error ? error.message : String(error));
    }
  }

  const localTaskPaneRenderers = createAutomationsLocalTaskPaneRenderers({
    autoDispatchStatus,
    orchestrationBoard,
    orchestrationError,
    projectOptions,
    legacyCompilerEnabled: workflowRecorderSurface.legacyCompilerEnabled,
    routeDetailForThread: automationThreadRouteDetail,
    selectedFolder,
    selectedTaskProjectPath,
    tooltips: automationHeadingTooltips,
    visibleTaskRuns,
    visibleTasks,
    visibleThreads,
    taskById,
    localTaskController,
    onCreateProject: createProjectForLocalTask,
    onOpenRunThread,
    onOpenThread: openAutomationThreadCard,
    onProjectPathChange: setTaskProjectPath,
    onRefresh: loadAutomationSurface,
  });

  const { renderLegacyWorkflowHiddenPane, renderWorkflowAgentPane, renderWorkflowLabHomePane, renderWorkflowRecordingPlaybookPane } =
    createAutomationsWorkflowAgentPaneRenderers({
      localTaskPaneRenderers,
      selectedWorkflowAgentArtifact,
      selectedWorkflowAgentThread,
      selectedWorkflowRecording,
      surface: {
        disabledStartTitle: workflowRecorderSurface.startPane.disabledStartTitle,
        legacyCompilerEnabled: workflowRecorderSurface.legacyCompilerEnabled,
        legacyHidden: workflowRecorderSurface.legacyHidden,
        primaryCreateLabel: workflowRecorderSurface.primaryCreateLabel,
        startPane: workflowRecorderSurface.startPane,
        workflowAgentTooltip: automationHeadingTooltips.workflowAgent,
        workflowLabTooltip: activePaneTooltip("workflow_lab"),
      },
      workflowBusy,
      workflowCompileProgress,
      workflowDiscoveryBusy,
      workflowError,
      workflowLabBusy,
      workflowLabGoal,
      workflowLabRun,
      workflowLabStatus,
      workflowRecordingExportBusyThreadId,
      workflowRecordingExportStatus,
      workflowRecordingLibrary,
      workflowRequest,
      workflowRequestRef,
      workflowRevisions,
      workflowRevisionSource,
      clearFocusedSchedule: scheduleController.clearFocusedSchedule,
      clearWorkflowRevisionDraft,
      compileWorkflowPreview,
      copyWorkflowCompileFailureReport,
      createWorkflowLabRunForPlaybook,
      createWorkflowSample,
      exportWorkflowRecordingPlaybookSession,
      focusWorkflowRequestEditor,
      loadWorkflowDashboard,
      onArchiveWorkflowRecordingPlaybook,
      onEditWorkflowRecordingPlaybook,
      openWorkflowCompileDiagnostics,
      onPreviewLocalPath,
      onRestoreWorkflowRecordingVersion,
      onSelectPane,
      onSelectWorkflowRecordingPlaybook,
      onSetWorkflowRecordingEnabled,
      onStartWorkflowRecording,
      onUnarchiveWorkflowRecordingPlaybook,
      renderWorkflowDiscoveryThread,
      renderWorkflowThreadDetail,
      setScheduleTarget: scheduleController.setScheduleTarget,
      setWorkflowBusy,
      setWorkflowError,
      setWorkflowLabGoal,
      setWorkflowRequest,
      startWorkflowDiscoveryFromRequest,
      startWorkflowLabRun,
      stopWorkflowLabRun,
      adoptWorkflowLabBestVariant,
    });

  function renderWorkflowRunCards(runs: WorkflowRunSummary[], limit = 6) {
    return (
      <WorkflowRunCards
        runs={runs}
        limit={limit}
        artifactById={artifactById}
        workflowBusy={workflowBusy}
        onOpenRunDetail={(runId) => void openWorkflowRunDetail(runId, { focusConsole: true })}
        onOpenSchedule={(scheduleId) => {
          scheduleController.focusScheduleHistory(scheduleId);
          onSelectPane("schedules");
        }}
        onResumeRun={(run, artifact) =>
          void runWorkflowArtifact(artifact.id, "execute", {
            resumeFromRunId: run.id,
            allowUnapproved: artifact.status !== "approved",
            runLimits: workflowRunLimitOverridesForArtifact(artifact),
          })
        }
      />
    );
  }

  const workflowArtifactPanels = workflowArtifactPanelRenderers({
    state: {
      workflowBusy,
      workflowRunIdleTimeoutMs,
      workflowRunTotalLimitMode,
      permissionGrants,
      permissionAudit,
      activeThreadId,
      workspacePath,
      workflowConnectorAccounts,
      automationPluginRegistry,
      permissionGrantRevoking,
      workflowSourceDrafts,
      selectedWorkflowAgentArtifactId: selectedWorkflowAgentArtifact?.id,
      selectedWorkflowAgentSourceNode,
      selectedWorkflowAgentThreadNodes: selectedWorkflowAgentThread?.graph?.nodes,
      workflowVersions,
      workflowRevisions,
      runConsoleRef: workflowRunConsoleRef,
    },
    actions: {
      onWorkflowRunIdleTimeoutChange: setWorkflowRunIdleTimeoutMs,
      onWorkflowRunTotalLimitModeChange: setWorkflowRunTotalLimitMode,
      onWorkflowConnectorAccountChange: updateWorkflowConnectorAccount,
      onWorkflowConnectorRetentionChange: updateWorkflowConnectorRetention,
      onRemoveWorkflowConnectorScope: removeWorkflowConnectorScope,
      onRejectWorkflowConnectorGrant: rejectWorkflowConnectorGrant,
      onRevokePermissionGrantIds,
      onRevokePermissionGrant,
      onOpenRunDetail: openWorkflowRunDetail,
      onCancelRun: cancelWorkflowRun,
      onRunArtifact: runWorkflowArtifact,
      runLimitsForArtifact: workflowRunLimitOverridesForArtifact,
      onCloseRunConsole: () => {
        workflowDetailRunIdRef.current = undefined;
        setWorkflowDetail(undefined);
      },
      onResumeTotalRuntimePause: resumeWorkflowTotalRuntimePause,
      onSelectSourceNode: setSelectedWorkflowGraphNodeId,
      onSourceDraftChange: setWorkflowSourceDraft,
      onSourceDraftClear: clearWorkflowSourceDraft,
      onSourceSave: saveWorkflowArtifactSource,
      onResolveApproval: resolveWorkflowApproval,
      onAnswerRuntimeInput: answerWorkflowRuntimeInput,
      onRevealBrowser: (request) =>
        window.ambientDesktop.revealBrowser(request).catch((error) => {
          setWorkflowError(error instanceof Error ? error.message : String(error));
        }),
      onPreviewPath,
      onPreviewLocalPath,
      onOpenMediaModal,
      onStartRevision: startWorkflowArtifactRevision,
      onResolveRevision: resolveWorkflowRevisionProposal,
      onRestoreVersionForReview: restoreWorkflowVersionForReview,
    },
  });

  function renderWorkflowReviewWorkspace(thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) {
    const reviewModel = workflowReviewWorkspaceViewModel({
      thread,
      artifact,
      runs: workflowDashboard?.runs ?? [],
      detail: selectedWorkflowAgentDetail,
      versions: workflowVersions,
      schedules: automationSchedules,
      permissionGrants,
      permissionAudit,
      permissionMode,
      auditThreadId: activeThreadId,
      workspacePath,
      selectedWorkflowAgentThreadId: selectedWorkflowAgentThread?.id,
      selectedWorkflowAgentSourceNode,
      runLimits: workflowRunLimitOverridesForArtifact(artifact),
    });
    return (
      <WorkflowReviewWorkspace
        threadId={thread.id}
        discoveryQuestions={thread.discoveryQuestions}
        artifact={artifact}
        latestRun={reviewModel.latestRun}
        detail={reviewModel.detail}
        review={reviewModel.review}
        runBlocked={reviewModel.runBlocked}
        runLimits={reviewModel.runLimits}
        currentVersion={reviewModel.currentVersion}
        selectedSourceNode={reviewModel.selectedSourceNode}
        sourceNodes={reviewModel.sourceNodes}
        scheduleState={reviewModel.scheduleState}
        workflowGrantRegistry={reviewModel.workflowGrantRegistry}
        workflowRunIdleTimeoutMs={workflowRunIdleTimeoutMs}
        workflowRunTotalLimitMode={workflowRunTotalLimitMode}
        workflowBusy={workflowBusy}
        schedulePreset={schedulePreset}
        scheduleExpression={scheduleExpression}
        scheduleEnabled={scheduleEnabled}
        scheduleBusy={scheduleBusy}
        scheduleTargetType={scheduleTargetType}
        scheduleError={scheduleError}
        expandedScheduleHistoryId={expandedScheduleHistoryId}
        permissionGrantRevoking={permissionGrantRevoking}
        workflowSourceDraft={workflowSourceDrafts[artifact.id]}
        connectorAccounts={workflowConnectorAccounts}
        pluginRegistry={automationPluginRegistry}
        connectorGrantsTooltip={automationHeadingTooltips.connectorGrants}
        auditPreviewTooltip={automationHeadingTooltips.auditPreview}
        reviewQueueTooltip={automationHeadingTooltips.reviewQueue}
        renderVersionHistory={() => workflowArtifactPanels.renderVersionHistoryPanel(thread, artifact)}
        auditReportPreview={workflowAuditReportPreview}
        onOpenPanel={(panel) => openWorkflowPanelFromTranscript(thread.id, panel)}
        onWorkflowRunIdleTimeoutMsChange={setWorkflowRunIdleTimeoutMs}
        onWorkflowRunTotalLimitModeChange={setWorkflowRunTotalLimitMode}
        onRevalidateArtifact={(artifactId) => revalidateWorkflowArtifactPreview(artifactId)}
        onRunArtifact={(artifactId, mode, options) => runWorkflowArtifact(artifactId, mode, options)}
        onOpenRunDetail={(runId) => openWorkflowRunDetail(runId, { focusConsole: true })}
        onReviewArtifact={(artifactId, status) => reviewWorkflowArtifact(artifactId, status)}
        onStartRevision={startWorkflowArtifactRevision}
        onScheduleThread={(threadId) => {
          scheduleController.setScheduleTarget("workflow_thread", threadId);
          onSelectPane("schedules");
        }}
        onCancelRun={cancelWorkflowRun}
        onSchedulePresetChange={scheduleController.setSchedulePreset}
        onScheduleExpressionChange={scheduleController.setScheduleExpression}
        onScheduleEnabledChange={scheduleController.setScheduleEnabled}
        onCreateSchedule={(targetKind, targetId) =>
          scheduleController.createWorkflowReviewSchedule(targetKind, targetId, selectedWorkflowAgentArtifact)
        }
        onCreateScheduleGrant={(schedule) => scheduleController.createWorkflowScheduleGrant(thread, schedule)}
        onSetExpandedScheduleHistoryId={scheduleController.setExpandedScheduleHistoryId}
        onConnectorAccountChange={(connector, nextAccountId) => updateWorkflowConnectorAccount(artifact.id, connector, nextAccountId)}
        onConnectorRetentionChange={(connector, dataRetention) => updateWorkflowConnectorRetention(artifact.id, connector, dataRetention)}
        onConnectorScopeRemove={(connector, scope) => removeWorkflowConnectorScope(artifact.id, connector, scope)}
        onConnectorReject={(connector) => rejectWorkflowConnectorGrant(artifact.id, connector)}
        onRevokePermissionGrantIds={onRevokePermissionGrantIds}
        onRevokePermissionGrant={onRevokePermissionGrant}
        onSelectSourceNode={setSelectedWorkflowGraphNodeId}
        onSourceDraftChange={(source) => setWorkflowSourceDraft(artifact.id, source)}
        onSourceDraftClear={() => clearWorkflowSourceDraft(artifact.id)}
        onSourceSave={(source) => saveWorkflowArtifactSource(artifact.id, source)}
        onResolveApproval={(runId, approvalId, decision) => resolveWorkflowApproval(runId, approvalId, decision)}
      />
    );
  }

  function renderWorkflowRequestEditor(thread: WorkflowAgentThreadSummary, ariaLabel = "Workflow request") {
    const requestDraft = workflowRequestRestartDrafts[thread.id] ?? thread.initialRequest;
    const requestChanged = requestDraft.trim() !== thread.initialRequest.trim();
    const restartBusy = workflowDiscoveryBusy === `restart:${thread.id}`;
    return (
      <WorkflowRequestEditor
        thread={thread}
        requestDraft={requestDraft}
        requestChanged={requestChanged}
        restartBusy={restartBusy}
        textareaRef={workflowRequestRef}
        ariaLabel={ariaLabel}
        onDraftChange={(threadId, value) => setWorkflowRequestRestartDrafts((current) => ({ ...current, [threadId]: value }))}
        onReset={(workflowThread) =>
          setWorkflowRequestRestartDrafts((current) => ({ ...current, [workflowThread.id]: workflowThread.initialRequest }))
        }
        onRestart={(workflowThread) => void restartWorkflowDiscoveryThread(workflowThread)}
      />
    );
  }

  function workflowExplorationGate(thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) {
    return workflowExplorationGateForThread({
      thread,
      revision,
      chatMessages: workflowThreadChatMessagesByThreadId[thread.id],
      traces: workflowExplorationTracesByThreadId[thread.id],
      progress: workflowExplorationProgressByThreadId[thread.id],
      skipped: Boolean(workflowExplorationSkippedByThreadId[thread.id]),
    });
  }

  function renderWorkflowExplorationPanel(
    thread: WorkflowAgentThreadSummary,
    artifact?: WorkflowArtifactSummary,
    revision?: WorkflowRevisionSummary,
  ) {
    const traces = workflowExplorationTracesByThreadId[thread.id] ?? [];
    const gate = workflowExplorationGate(thread, revision);
    const explorationBudgets = workflowExplorationBudgetsForThread(thread.id);
    return (
      <WorkflowExplorationPanel
        thread={thread}
        artifact={artifact}
        revision={revision}
        traces={traces}
        progress={workflowExplorationProgressByThreadId[thread.id]}
        gate={gate}
        budgets={explorationBudgets}
        workflowBusy={workflowBusy}
        onRunExploration={(workflowThread) => void runWorkflowExplorationForThread(workflowThread)}
        onSkipExploration={skipWorkflowExplorationForThread}
        onCompile={(workflowThread, workflowRevision) => void compileWorkflowThreadPreview(workflowThread, workflowRevision)}
        onUpdateBudget={updateWorkflowExplorationBudget}
        onResetBudget={resetWorkflowExplorationBudget}
      />
    );
  }

  function handleWorkflowGraphNodeReviewAction(action: WorkflowGraphNodeReviewAction, artifact?: WorkflowArtifactSummary) {
    const workflowThreadId = artifact?.workflowThreadId ?? selectedWorkflowAgentThread?.id;
    if (action.targetSection === "source") setWorkflowArtifactPanel(workflowThreadId, "source");
    if (action.targetSection === "audit") setWorkflowArtifactPanel(workflowThreadId, "run_console");
    if (action.targetSection === "connectors") setWorkflowArtifactPanel(workflowThreadId, "permissions");
    if (action.targetSection === "mutation_policy") setWorkflowArtifactPanel(workflowThreadId, "manifest");
    if (action.id === "open_audit" && artifact) {
      const latestRun = workflowDashboard ? latestWorkflowRunForArtifact(workflowDashboard.runs, artifact.id) : undefined;
      if (latestRun && selectedWorkflowAgentDetail?.run.id !== latestRun.id) void openWorkflowRunDetail(latestRun.id);
    }
    requestAnimationFrame(() => {
      const target = findWorkflowGraphNodeReviewActionTarget(document, action);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderWorkflowThreadComposer(thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail) {
    const draft = workflowThreadComposerDrafts[thread.id] ?? "";
    return (
      <WorkflowThreadComposerView
        thread={thread}
        detail={detail}
        draft={draft}
        workflowBusy={workflowBusy}
        workflowDiscoveryBusy={workflowDiscoveryBusy}
        composerBusy={workflowThreadComposerBusy === thread.id}
        onDraftChange={(threadId, value) => setWorkflowThreadComposerDrafts((current) => ({ ...current, [threadId]: value }))}
        onSend={(workflowThread, runDetail) => sendWorkflowThreadComposer(workflowThread, runDetail)}
      />
    );
  }

  function renderWorkflowBuildWorkspace(
    thread: WorkflowAgentThreadSummary,
    artifact: WorkflowArtifactSummary | undefined,
    transcriptCards: WorkflowThreadTranscriptCard[],
  ) {
    const buildModel = workflowBuildWorkspaceViewModel({
      thread,
      artifact,
      selectedDetail: selectedWorkflowAgentDetail,
      runs: workflowDashboard?.runs ?? [],
      versions: workflowVersions,
      explorationTraceCount: workflowExplorationTracesByThreadId[thread.id]?.length ?? 0,
      explorationGate: workflowExplorationGate(thread),
      selectedWorkflowAgentThreadId: selectedWorkflowAgentThread?.id,
      selectedWorkflowAgentSourceNode,
      workflowBusy,
      workflowCompileThreadId,
      workflowCompileProgress,
      workflowDiscoveryBusy,
      workflowThreadSessionBusy,
      workflowThreadComposerBusy,
      sourceDrafts: workflowSourceDrafts,
    });
    return (
      <WorkflowBuildWorkspace
        thread={thread}
        artifact={artifact}
        {...buildModel}
        transcriptCards={transcriptCards}
        requestedArtifactPanel={workflowArtifactPanelByThreadId[thread.id]}
        selectedNodeId={selectedWorkflowGraphNodeId}
        workflowBusy={workflowBusy}
        onOpenPersistentStatusTarget={openWorkflowPersistentStatusTarget}
        onSetBuildPanel={setWorkflowBuildPanel}
        onPrepareSession={(workflowThread) => void prepareWorkflowThreadSession(workflowThread)}
        onOpenTranscriptPanel={openWorkflowPanelFromTranscript}
        onResolveRevision={(revisionId, decision) => void resolveWorkflowRevisionProposal(revisionId, decision)}
        onRunExploration={(workflowThread) => void runWorkflowExplorationForThread(workflowThread)}
        onSkipExploration={skipWorkflowExplorationForThread}
        onCompile={(workflowThread) => void compileWorkflowThreadPreview(workflowThread)}
        onSelectSourceNode={setSelectedWorkflowGraphNodeId}
        onSourceDraftChange={setWorkflowSourceDraft}
        onSourceDraftClear={clearWorkflowSourceDraft}
        onSourceSave={(artifactId, source) => saveWorkflowArtifactSource(artifactId, source)}
        renderRequestEditor={renderWorkflowRequestEditor}
        renderThreadComposer={renderWorkflowThreadComposer}
        renderReviewWorkspace={renderWorkflowReviewWorkspace}
        renderExplorationPanel={renderWorkflowExplorationPanel}
        renderRunConsolePanel={workflowArtifactPanels.renderRunConsolePanel}
        renderRuntimeInputPanel={workflowArtifactPanels.renderRuntimeInputPanel}
        renderOutputsPanel={workflowArtifactPanels.renderOutputsPanel}
        renderManifestPanel={workflowArtifactPanels.renderManifestPanel}
        renderPermissionsPanel={workflowArtifactPanels.renderPermissionsPanel}
        renderVersionHistoryPanel={workflowArtifactPanels.renderVersionHistoryPanel}
      />
    );
  }

  function renderWorkflowPersistentDiagramPane(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) {
    const detail =
      selectedWorkflowAgentDetail && (!artifact || selectedWorkflowAgentDetail.artifact.id === artifact.id)
        ? selectedWorkflowAgentDetail
        : undefined;
    return (
      <section className="automation-section workflow-persistent-diagram-pane" data-workflow-artifact-panel="diagram">
        <WorkflowAgentDiagramPane
          thread={thread}
          artifact={artifact}
          events={detail?.events}
          detail={detail}
          selectedNodeId={selectedWorkflowGraphNodeId}
          activeNodeIdOverride={workflowExplorationProgressByThreadId[thread.id]?.status === "running" ? "agent-exploration" : undefined}
          onSelectNode={setSelectedWorkflowGraphNodeId}
          onNodeReviewAction={(action) => handleWorkflowGraphNodeReviewAction(action, artifact)}
          debugRewriteBusyEventId={workflowBusy?.startsWith("debug-rewrite:") ? workflowBusy.slice("debug-rewrite:".length) : undefined}
          recoveryBusyKey={workflowBusy?.startsWith("recover:") ? workflowBusy.slice("recover:".length) : undefined}
          onRecover={(card, action) => void recoverWorkflowRun(card, action)}
          onDebugRewrite={(card) => void debugRewriteWorkflowRun(card)}
        />
      </section>
    );
  }

  function renderWorkflowThreadDetail(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) {
    const threadRevisions = workflowRevisions.filter((revision) => revision.workflowThreadId === thread.id);
    const transcriptCards = workflowThreadTranscriptCards({
      thread,
      artifact,
      detail: selectedWorkflowAgentDetail,
      revisions: threadRevisions,
      chatMessages: workflowThreadChatMessagesByThreadId[thread.id],
      planEditActivity: workflowThreadPlanEditActivityByThreadId[thread.id],
      explorationProgress: workflowExplorationProgressByThreadId[thread.id],
      explorationTraces: workflowExplorationTracesByThreadId[thread.id],
      compileActive: workflowBusy === "compile" && workflowCompileThreadId === thread.id,
      compileProgress: workflowCompileThreadId === thread.id ? workflowCompileProgress : [],
      includeRequestCard: false,
    });
    return (
      <div className="automation-focused-grid workflow-discovery-layout" style={workflowDiscoveryLayoutStyle}>
        {renderWorkflowBuildWorkspace(thread, artifact, transcriptCards)}
        {renderWorkflowSplitHandle()}
        {renderWorkflowPersistentDiagramPane(thread, artifact)}
      </div>
    );
  }

  function renderWorkflowThreadRunsPane(thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) {
    return (
      <WorkflowFocusedRunsPane
        thread={thread}
        artifact={artifact}
        state={{
          dashboard: workflowDashboard,
          selectedDetail: selectedWorkflowAgentDetail,
          activePanelId: workflowRunsPanelByThreadId[thread.id],
          artifactById,
          workflowBusy,
          workflowCompileThreadId,
          workflowCompileProgress,
          workflowDiscoveryBusy,
        }}
        slots={{
          layoutStyle: workflowDiscoveryLayoutStyle,
          splitHandle: renderWorkflowSplitHandle(),
          diagramPane: renderWorkflowPersistentDiagramPane(thread, artifact),
        }}
        actions={{
          runLimitsForArtifact: workflowRunLimitOverridesForArtifact,
          isArtifactRunBlocked: workflowArtifactRunBlocked,
          auditReportPreview: workflowAuditReportPreview,
          onOpenPersistentStatusTarget: openWorkflowPersistentStatusTarget,
          onSelectPanel: setWorkflowRunsPanel,
          onRunArtifact: runWorkflowArtifact,
          onOpenRunDetail: openWorkflowRunDetail,
          onOpenSchedule: (scheduleId) => {
            scheduleController.focusScheduleHistory(scheduleId);
            onSelectPane("schedules");
          },
          renderRunConsole: workflowArtifactPanels.renderRunConsole,
          renderRuntimeInputPanel: workflowArtifactPanels.renderRuntimeInputPanel,
          renderOutputsPanel: workflowArtifactPanels.renderOutputsPanel,
        }}
      />
    );
  }

  function renderWorkflowDiscoveryThread(thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) {
    const discoveryModel = workflowDiscoveryThreadWorkspaceViewModel({
      thread,
      revision,
      artifact: selectedWorkflowAgentArtifact,
      workflowBusy,
      workflowCompileThreadId,
      workflowCompileProgress,
      workflowDiscoveryBusy,
      workflowDiscoveryProgress,
    });
    return (
      <WorkflowDiscoveryThreadWorkspace
        thread={thread}
        revision={revision}
        layoutStyle={workflowDiscoveryLayoutStyle}
        splitHandle={renderWorkflowSplitHandle()}
        diagramPane={
          <section className="automation-section workflow-agent-diagram-section">
            <WorkflowAgentDiagramPane
              thread={thread}
              selectedNodeId={selectedWorkflowGraphNodeId}
              onSelectNode={setSelectedWorkflowGraphNodeId}
            />
          </section>
        }
        model={discoveryModel}
        workflowDiscoveryBusy={workflowDiscoveryBusy}
        workflowBusy={workflowBusy}
        workflowError={workflowError}
        workflowDiscoveryAnswers={workflowDiscoveryAnswers}
        optimisticWorkflowDiscoveryAnswers={optimisticWorkflowDiscoveryAnswers}
        workflowCompileProgress={workflowCompileProgress}
        revisions={workflowRevisions}
        onOpenPersistentStatusTarget={openWorkflowPersistentStatusTarget}
        renderRequestEditor={renderWorkflowRequestEditor}
        renderExplorationPanel={renderWorkflowExplorationPanel}
        onCustomValueChange={(questionId, value) => setWorkflowDiscoveryAnswers((current) => ({ ...current, [questionId]: value }))}
        onAnswer={(questionId, choiceId, freeform) => void answerWorkflowDiscoveryQuestion(questionId, choiceId, freeform)}
        onResolveAccessRequest={(questionId, accessRequestId, response) =>
          void resolveWorkflowDiscoveryAccessRequest(questionId, accessRequestId, response)
        }
        onCompile={(workflowThread, workflowRevision) => void compileWorkflowThreadPreview(workflowThread, workflowRevision)}
        onOpenCompileDiagnostics={(path) => void openWorkflowCompileDiagnostics(path)}
        onEditRequest={focusWorkflowRequestEditor}
        onReportCompileUnsupported={(reportText) => void copyWorkflowCompileFailureReport(reportText)}
        onStartRevision={(artifact) => void startWorkflowArtifactRevision(artifact)}
        onResolveRevision={(revisionId, decision) => void resolveWorkflowRevisionProposal(revisionId, decision)}
      />
    );
  }

  function renderWorkflowSchedulesPane(thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) {
    return (
      <WorkflowFocusedSchedulesPane
        thread={thread}
        artifact={artifact}
        state={{
          activePanel: workflowSchedulePanel,
          versions: workflowVersions.filter((version) => version.workflowThreadId === thread.id),
          workflowRuns: workflowDashboard?.runs ?? [],
          selectedDetail: selectedWorkflowAgentDetail,
          schedules: automationSchedules,
          scheduleExceptions: automationScheduleExceptions,
          permissionGrants,
          permissionAudit,
          permissionMode,
          auditThreadId: activeThreadId,
          workspacePath,
          scheduleTargetType,
          scheduleTargetId,
          schedulePreset,
          scheduleExpression,
          scheduleEnabled,
          scheduleRunIdleTimeoutMs,
          scheduleRunTotalLimitMode,
          scheduleRunLimits: scheduleController.scheduleRunLimitsForArtifact(artifact),
          scheduleBusy,
          scheduleError,
          focusedScheduleId,
          scheduleEditScope,
          expandedScheduleHistoryId,
          occurrenceEditor: scheduleOccurrenceEditor,
          workflowBusy,
          workflowCompileThreadId,
          workflowCompileProgress,
          workflowDiscoveryBusy,
        }}
        slots={{
          layoutStyle: workflowDiscoveryLayoutStyle,
          splitHandle: renderWorkflowSplitHandle(),
          diagramPane: renderWorkflowPersistentDiagramPane(thread, artifact),
        }}
        actions={{
          onSetPanel: scheduleController.setWorkflowSchedulePanel,
          onCreateNewSeries: scheduleController.createNewWorkflowScheduleSeries,
          onSetScheduleTarget: scheduleController.setScheduleTarget,
          onSetSchedulePreset: scheduleController.setSchedulePreset,
          onSetScheduleExpression: scheduleController.setScheduleExpression,
          onSetScheduleEnabled: scheduleController.setScheduleEnabled,
          onSetScheduleRunIdleTimeoutMs: scheduleController.setScheduleRunIdleTimeoutMs,
          onSetScheduleRunTotalLimitMode: scheduleController.setScheduleRunTotalLimitMode,
          onSetScheduleEditScope: scheduleController.setScheduleEditScope,
          onSaveSchedule: (targetKind, targetId) => scheduleController.saveWorkflowSchedule(targetKind, targetId, artifact),
          onRefreshSchedules: scheduleController.loadAutomationSchedules,
          onSetExpandedScheduleHistoryId: scheduleController.setExpandedScheduleHistoryId,
          onCreateScheduleGrant: (schedule) => scheduleController.createWorkflowScheduleGrant(thread, schedule),
          onChangeOccurrenceEditor: scheduleController.setScheduleOccurrenceEditor,
          onCloseOccurrenceEditor: () => scheduleController.setScheduleOccurrenceEditor(undefined),
          onEditOccurrenceSeriesScope: scheduleController.editOccurrenceSeriesScope,
          onSaveOccurrenceEditor: scheduleController.saveWorkflowScheduleOccurrenceEditor,
          onSkipOccurrence: scheduleController.skipWorkflowScheduleOccurrence,
          onOpenOccurrenceEditor: scheduleController.openWorkflowScheduleOccurrenceEditor,
          onDeferOccurrence: scheduleController.deferWorkflowScheduleOccurrence,
          onUpdateOccurrenceRunLimits: scheduleController.updateWorkflowScheduleOccurrenceRunLimits,
          onEditSchedule: scheduleController.editAutomationSchedule,
          onDuplicateSchedule: scheduleController.duplicateAutomationSchedule,
          onOpenRunDetail: (runId) => openWorkflowRunDetail(runId, { focusConsole: true }),
          onCreateGrantAction: (action) => scheduleController.createWorkflowScheduleGrantAction(thread, action),
          onOpenPersistentStatusTarget: openWorkflowPersistentStatusTarget,
        }}
      />
    );
  }

  function renderSchedulesPane() {
    const { workflowScheduleThread, workflowScheduleArtifact } = workflowSchedulesPaneRouteModel({
      selectedWorkflowThread: selectedWorkflowAgentThread,
      selectedWorkflowArtifact: selectedWorkflowAgentArtifact,
      focusedScheduleId,
      schedules: automationSchedules,
      workflowVersions,
      artifactById,
      workflowThreadById: workflowAgentThreadById,
      workflowThreadByArtifactId: workflowAgentThreadByArtifactId,
    });
    if (workflowScheduleThread && workflowScheduleArtifact) {
      return renderWorkflowSchedulesPane(workflowScheduleThread, workflowScheduleArtifact);
    }
    const workflowRuns = workflowDashboard?.runs ?? [];
    return (
      <AutomationSchedulesFallbackPane
        projectField={localTaskPaneRenderers.renderProjectField()}
        autoDispatchToggle={localTaskPaneRenderers.renderAutoDispatchToggle()}
        autoDispatchStatus={localTaskPaneRenderers.renderAutoDispatchStatus()}
        scheduleTooltip={automationHeadingTooltips.schedules}
        autoDispatchTooltip={automationHeadingTooltips.autoDispatch}
        schedules={automationSchedules}
        focusedScheduleId={focusedScheduleId}
        scheduleTargetType={scheduleTargetType}
        scheduleTargetId={scheduleTargetId}
        targetSources={automationScheduleTargetSources()}
        schedulePreset={schedulePreset}
        scheduleExpression={scheduleExpression}
        scheduleEnabled={scheduleEnabled}
        scheduleBusy={scheduleBusy}
        scheduleError={scheduleError}
        expandedScheduleHistoryId={expandedScheduleHistoryId}
        workflowRuns={workflowRuns}
        onScheduleTargetTypeChange={scheduleController.setScheduleTargetTypeAndClearId}
        onScheduleTargetIdChange={scheduleController.setScheduleTargetId}
        onSchedulePresetChange={scheduleController.setSchedulePreset}
        onScheduleExpressionChange={scheduleController.setScheduleExpression}
        onScheduleEnabledChange={scheduleController.setScheduleEnabled}
        onSaveSchedule={() => void scheduleController.createAutomationSchedule(automationScheduleTargetSources())}
        onRefreshSchedules={() => void scheduleController.loadAutomationSchedules()}
        onClearFocusedSchedule={scheduleController.clearFocusedSchedule}
        onToggleScheduleHistoryExpanded={scheduleController.setExpandedScheduleHistoryId}
        onOpenRunThread={(threadId) => void onOpenRunThread(threadId)}
        onOpenRunDetail={(runId) => void openWorkflowRunDetail(runId, { focusConsole: true })}
      />
    );
  }

  function renderAutomationPane() {
    return (
      <AutomationPaneRouter
        activePane={activePane}
        selectedWorkflowRecordingActive={Boolean(selectedWorkflowRecording)}
        renderWorkflowRecordingPlaybookPane={() =>
          selectedWorkflowRecording ? renderWorkflowRecordingPlaybookPane(selectedWorkflowRecording) : null
        }
        renderLocalTasksPane={localTaskPaneRenderers.renderLocalTasksPane}
        renderWorkflowAgentPane={renderWorkflowAgentPane}
        renderWorkflowLabHomePane={renderWorkflowLabHomePane}
        renderSchedulesPane={renderSchedulesPane}
        renderRunsReviewsPane={() => (
          <AutomationsWorkspaceRunsReviewsPane
            selectedWorkflowAgentThread={selectedWorkflowAgentThread}
            selectedWorkflowAgentArtifact={selectedWorkflowAgentArtifact}
            legacyCompilerEnabled={workflowRecorderSurface.legacyCompilerEnabled}
            allAutomationThreads={allAutomationThreads}
            reviewTooltip={automationHeadingTooltips.reviewQueue}
            localTaskRuns={localTaskPaneRenderers.renderTaskRuns(allTaskRuns, 8)}
            workflowRuns={renderWorkflowRunCards(workflowRuns, 8)}
            workflowConsole={workflowArtifactPanels.renderRunConsole(workflowDetail)}
            routeDetailForThread={automationThreadRouteDetail}
            onOpenThread={openAutomationThreadCard}
            renderWorkflowThreadRunsPane={renderWorkflowThreadRunsPane}
            renderLegacyWorkflowHiddenPane={renderLegacyWorkflowHiddenPane}
          />
        )}
        renderFolderPane={localTaskPaneRenderers.renderFolderPane}
        renderHomePane={() => (
          <AutomationsWorkspaceHomePane
            allAutomationThreads={allAutomationThreads}
            homeExplainer={workflowRecorderSurface.homeExplainer}
            legacyCompilerEnabled={workflowRecorderSurface.legacyCompilerEnabled}
            newWorkflowLabel={workflowRecorderSurface.newWorkflowLabel}
            reviewTooltip={automationHeadingTooltips.reviewQueue}
            routeDetailForThread={automationThreadRouteDetail}
            onOpenThread={openAutomationThreadCard}
            onSelectPane={onSelectPane}
            playbooks={workflowRecordingLibrary}
            query={workflowLibraryQuery}
            includeArchived={workflowLibraryIncludeArchived}
            refreshing={workflowLibraryRefreshing}
            exportBusyThreadId={workflowRecordingExportBusyThreadId}
            exportStatus={workflowRecordingExportStatus}
            onQueryChange={setWorkflowLibraryQuery}
            onIncludeArchivedChange={onWorkflowLibraryIncludeArchivedChange}
            onRefresh={refreshWorkflowRecordingLibraryFromHome}
            onEditPlaybook={onEditWorkflowRecordingPlaybook}
            onOpenPlaybook={onSelectWorkflowRecordingPlaybook}
            onPreviewLocalPath={onPreviewLocalPath}
            onExportPlaybookSession={exportWorkflowRecordingPlaybookSession}
            onRestoreVersion={onRestoreWorkflowRecordingVersion}
            onSetEnabled={onSetWorkflowRecordingEnabled}
            onUnarchivePlaybook={onUnarchiveWorkflowRecordingPlaybook}
            onArchivePlaybook={onArchiveWorkflowRecordingPlaybook}
          />
        )}
      />
    );
  }

  return (
    <section className="automation-workspace">
      <AutomationWorkspaceHeader model={automationHeaderModel} helpText={automationHelpText} stats={automationShellModel.stats} />

      <AutomationsWorkspaceTabsView
        homeTitle={workflowRecorderSurface.homeTitle}
        homeTooltip={workflowRecorderSurface.homeTooltip}
        localTasksTooltip={automationHeadingTooltips.localTasks}
        workflowAgentLabel={workflowRecorderSurface.newWorkflowLabel}
        workflowAgentTooltip={automationHeadingTooltips.workflowAgent}
        workflowLabTooltip={activePaneTooltip("workflow_lab")}
        schedulesTooltip={automationHeadingTooltips.schedules}
        runsReviewsTooltip={automationHeadingTooltips.runsReviews}
        activePane={activePane}
        selectedThreadActive={Boolean(selectedThread)}
        onSelectPane={onSelectPane}
      />

      {selectedThread ? (
        <AutomationSelectedThreadDetailView
          selectedThread={selectedThread}
          folders={folders}
          selectedAutomationRun={selectedAutomationRun}
          selectedArtifact={selectedArtifact}
          selectedArtifactThreadRoute={selectedArtifactThreadRoute}
          selectedArtifactWorkflowThread={selectedArtifactWorkflowThread}
          selectedTask={selectedTask}
          visibleTaskRuns={visibleTaskRuns}
          startingRunId={localTaskController.startingRunId}
          workflowAgentTooltip={automationHeadingTooltips.workflowAgent}
          localTasksTooltip={automationHeadingTooltips.localTasks}
          recentRunsTooltip={automationHeadingTooltips.recentRuns}
          onMoveThread={onMoveThread}
          onOpenRunThread={onOpenRunThread}
          onRevealWorkspace={localTaskController.revealOrchestrationWorkspace}
          onOpenWorkflowArtifactThread={openWorkflowArtifactThread}
          onUpdateTaskState={localTaskController.updateTaskState}
          onUpdateTaskLabels={localTaskController.updateTaskLabels}
          onStartRun={localTaskController.startOrchestrationRun}
        />
      ) : (
        <>{renderAutomationPane()}</>
      )}
    </section>
  );
}

export type AutomationsWorkspaceProps = Parameters<typeof AutomationsWorkspace>[0];

export function workflowAuditReportPreview(value: string | undefined): string {
  const report = value || "No audit report was generated for this run.";
  if (report.length <= 12_000) return report;
  return `${report.slice(0, 11_400).trimEnd()}\n\n[Audit preview truncated ${report.length - 11_400} chars. Open the run evidence panels for bounded events, model calls, checkpoints, and outputs.]`;
}

export async function rendererPermissionGrantTargetHash(
  actionKind: CreateAmbientPermissionGrantInput["actionKind"],
  targetKind: CreateAmbientPermissionGrantInput["targetKind"],
  targetLabel: string,
): Promise<string> {
  const payload = `${actionKind}\0${targetKind}\0${targetLabel}`;
  if (!globalThis.crypto?.subtle) throw new Error("Browser crypto is unavailable; cannot create a persistent grant.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
