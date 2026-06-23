import { useEffect, useMemo } from "react";
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
} from "../../shared/workflowTypes";
import { createAutomationsLocalTaskPaneRenderers } from "./AutomationsLocalTaskPaneRenderers";
import { workflowConnectorAccountsByConnector } from "./AutomationsWorkflowEvidenceViews";
import { createAutomationsWorkflowNavigationController } from "./AutomationsWorkflowNavigationController";
import { useAutomationsWorkspaceControllerOwners } from "./AutomationsWorkspaceControllerOwners";
import { createAutomationsWorkspacePaneRenderers } from "./AutomationsWorkspacePaneRenderers";
import {
  automationWorkspaceActivePaneTooltip,
  automationWorkspacePaneTitle,
  automationWorkspaceShellModel,
  type AutomationPane,
} from "./AutomationsWorkspaceShellViews";
import { workflowRecorderLegacyCompilerEnabled, workflowRecorderSurfaceModel } from "./workflowRecorderUiModel";
import { workflowReviewArtifactRunBlocked } from "./workflowReviewUiModel";

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

export type AutomationsWorkspaceProps = {
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
};

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

export function useAutomationsWorkspaceControllerGraph(props: AutomationsWorkspaceProps) {
  const {
    activePane,
    selectedFolder,
    selectedThread,
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
    permissionGrants,
    permissionAudit,
    permissionMode,
    permissionGrantRevoking,
    workspacePath,
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
    onSelectWorkflowRecordingPlaybook,
    onSelectWorkflowAgentThread,
    onMoveThread,
    onSelectPane,
    onSelectThread,
    onOpenRunThread,
    onPreviewPath,
    onPreviewLocalPath,
    onOpenMediaModal,
  } = props;
  const {
    allAutomationThreads,
    allTaskRuns,
    artifactById,
    autoDispatchStatus,
    automationPluginRegistry,
    automationSelection,
    loadAutomationSurface,
    localTaskController,
    orchestrationBoard,
    orchestrationError,
    scheduleController,
    selectWorkflowAgentThreadForArtifact,
    selectedArtifact,
    selectedArtifactThreadRoute,
    selectedArtifactWorkflowThread,
    selectedAutomationRun,
    selectedTask,
    selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail,
    selectedWorkflowAgentSourceNode,
    setOrchestrationError,
    setTaskProjectPath,
    setWorkflowArtifactPanel,
    setWorkflowBuildPanel,
    setWorkflowBusy,
    setWorkflowError,
    setWorkflowRunIdleTimeoutMs,
    setWorkflowRunsPanel,
    setWorkflowRunTotalLimitMode,
    taskById,
    taskProjectPath,
    visibleTaskRuns,
    visibleTasks,
    visibleThreads,
    workflowAgentThreadByArtifactId,
    workflowAgentThreadById,
    workflowArtifactController,
    workflowBusy,
    workflowDashboardController,
    workflowDiscoveryController,
    workflowError,
    workflowLabController,
    workflowRecordingLibraryController,
    workflowRunIdleTimeoutMs,
    workflowRunTotalLimitMode,
    workflowRuns,
    workflowThreadController,
    workflowWorkspaceController,
  } = useAutomationsWorkspaceControllerOwners({
    ...props,
    createPermissionGrantTargetHash: rendererPermissionGrantTargetHash,
  });

  useEffect(() => {
    void loadAutomationSurface();
  }, [orchestrationRevision, orchestrationAutoRevision, workflowRevision]);

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

  const { renderAutomationPane, renderSelectedThreadDetail } = createAutomationsWorkspacePaneRenderers({
    activePane,
    activeThreadId,
    allAutomationThreads,
    allTaskRuns,
    artifactById,
    automationPluginRegistry,
    automationThreadRouteDetail,
    folders,
    localTaskPaneRenderers,
    orchestrationTasks: orchestrationBoard?.tasks ?? [],
    permissionAudit,
    permissionGrantRevoking,
    permissionGrants,
    permissionMode,
    selectedAutomationRun,
    selectedArtifact,
    selectedArtifactThreadRoute,
    selectedArtifactWorkflowThread,
    selectedTask,
    selectedThread,
    selectedWorkflowAgentArtifact,
    selectedWorkflowAgentDetail,
    selectedWorkflowAgentSourceNode,
    selectedWorkflowAgentThread,
    selectedWorkflowRecording,
    surface: {
      disabledStartTitle: workflowRecorderSurface.startPane.disabledStartTitle,
      homeExplainer: workflowRecorderSurface.homeExplainer,
      legacyCompilerEnabled: workflowRecorderSurface.legacyCompilerEnabled,
      legacyHidden: workflowRecorderSurface.legacyHidden,
      newWorkflowLabel: workflowRecorderSurface.newWorkflowLabel,
      primaryCreateLabel: workflowRecorderSurface.primaryCreateLabel,
      startPane: workflowRecorderSurface.startPane,
    },
    tooltips: {
      auditPreview: automationHeadingTooltips.auditPreview,
      autoDispatch: automationHeadingTooltips.autoDispatch,
      connectorGrants: automationHeadingTooltips.connectorGrants,
      localTasks: automationHeadingTooltips.localTasks,
      recentRuns: automationHeadingTooltips.recentRuns,
      reviewQueue: automationHeadingTooltips.reviewQueue,
      schedules: automationHeadingTooltips.schedules,
      workflowAgent: automationHeadingTooltips.workflowAgent,
      workflowLab: activePaneTooltip("workflow_lab"),
    },
    visibleTaskRuns,
    workflowAgentFolders,
    workflowAgentThreadByArtifactId,
    workflowAgentThreadById,
    workflowBusy,
    workflowCompileProgress,
    workflowConnectorAccounts,
    workflowDiscoveryProgress,
    workflowError,
    workflowExplorationProgressByThreadId,
    workflowRecordingLibrary,
    workflowRunIdleTimeoutMs,
    workflowRunTotalLimitMode,
    workflowRuns,
    workspacePath,
    controllers: {
      localTaskController,
      scheduleController,
      workflowArtifactController,
      workflowDashboardController,
      workflowDiscoveryController,
      workflowLabController,
      workflowRecordingLibraryController,
      workflowThreadController,
      workflowWorkspaceController,
    },
    actions: {
      onArchiveWorkflowRecordingPlaybook,
      onEditWorkflowRecordingPlaybook,
      onMoveThread,
      onOpenMediaModal,
      onOpenRunThread,
      onOpenThread: openAutomationThreadCard,
      onOpenWorkflowArtifactThread: openWorkflowArtifactThread,
      onPreviewLocalPath,
      onPreviewPath,
      onRestoreWorkflowRecordingVersion,
      onRevokePermissionGrant,
      onRevokePermissionGrantIds,
      onSelectPane,
      onSelectWorkflowRecordingPlaybook,
      onSetWorkflowRecordingEnabled,
      onStartWorkflowRecording,
      onUnarchiveWorkflowRecordingPlaybook,
      onWorkflowLibraryIncludeArchivedChange,
      onWorkflowRunIdleTimeoutMsChange: setWorkflowRunIdleTimeoutMs,
      onWorkflowRunTotalLimitModeChange: setWorkflowRunTotalLimitMode,
      openWorkflowPanelFromTranscript,
      openWorkflowPersistentStatusTarget,
      setWorkflowBusy,
      setWorkflowError,
      workflowArtifactRunBlocked,
      workflowAuditReportPreview,
    },
    workflowLibraryIncludeArchived,
  });

  return {
    automationHeaderModel,
    automationShellModel,
    renderAutomationPane,
    renderSelectedThreadDetail,
  };
}

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
