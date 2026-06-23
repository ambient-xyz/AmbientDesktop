import { useState } from "react";
import type { CreateAmbientPermissionGrantInput } from "../../shared/permissionTypes";
import type { WorkflowArtifactSummary } from "../../shared/workflowTypes";
import { useAutomationsLocalTaskController } from "./AutomationsLocalTaskController";
import { useAutomationScheduleController } from "./AutomationsScheduleController";
import { useAutomationsWorkflowArtifactController } from "./AutomationsWorkflowArtifactController";
import { useAutomationsWorkflowDashboardController } from "./AutomationsWorkflowDashboardController";
import { useAutomationsWorkflowDiscoveryController } from "./AutomationsWorkflowDiscoveryController";
import { useWorkflowLabController } from "./AutomationsWorkflowLabController";
import { useAutomationsWorkflowRecordingLibraryController } from "./AutomationsWorkflowRecordingLibraryController";
import { useAutomationsWorkflowThreadController } from "./AutomationsWorkflowThreadController";
import { useAutomationsWorkflowWorkspaceController } from "./AutomationsWorkflowWorkspaceController";
import type { AutomationsWorkspaceProps } from "./AutomationsWorkspaceControllerGraph";
import { useAutomationsWorkspaceSurfaceController } from "./AutomationsWorkspaceSurfaceController";
import { automationWorkspaceSelectionModel } from "./automationWorkspaceSelectionModel";
import {
  DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS,
  DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";

type CreatePermissionGrantTargetHash = (
  actionKind: CreateAmbientPermissionGrantInput["actionKind"],
  targetKind: CreateAmbientPermissionGrantInput["targetKind"],
  targetLabel: string,
) => Promise<string>;

export type AutomationsWorkspaceControllerOwnersInput = AutomationsWorkspaceProps & {
  createPermissionGrantTargetHash: CreatePermissionGrantTargetHash;
};

export function useAutomationsWorkspaceControllerOwners({
  activePane,
  activeProjectPath,
  activeThreadId,
  folders,
  selectedFolder,
  selectedThread,
  workspacePath,
  selectedWorkflowAgentFolder,
  selectedWorkflowAgentThread,
  selectedWorkflowRecording,
  workflowAgentFolders,
  workflowRevision,
  onWorkflowExplorationProgressChanged,
  permissionMode,
  model,
  thinkingLevel,
  onWorkflowCompileProgressReset,
  onWorkflowRevisionChanged,
  onFoldersChanged,
  onWorkflowAgentFoldersChanged,
  onRefreshWorkflowRecordingLibrary,
  onDesktopStateChanged,
  onSelectWorkflowAgentThread,
  createPermissionGrantTargetHash,
}: AutomationsWorkspaceControllerOwnersInput) {
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
  const workflowLabController = useWorkflowLabController({ selectedWorkflowRecording, onDesktopStateChanged });
  const [workflowBusy, setWorkflowBusy] = useState<string | undefined>();
  const [workflowRunIdleTimeoutMs, setWorkflowRunIdleTimeoutMs] = useState(DEFAULT_WORKFLOW_FOREGROUND_IDLE_TIMEOUT_MS);
  const [workflowRunTotalLimitMode, setWorkflowRunTotalLimitMode] = useState<WorkflowRunTotalLimitMode>(
    DEFAULT_WORKFLOW_FOREGROUND_TOTAL_LIMIT_MODE,
  );
  const workflowRecordingLibraryController = useAutomationsWorkflowRecordingLibraryController({
    onRefreshWorkflowRecordingLibrary,
    onWorkflowErrorChanged: setWorkflowError,
  });
  const workflowWorkspaceController = useAutomationsWorkflowWorkspaceController({
    selectedWorkflowAgentThreadId: selectedWorkflowAgentThread?.id,
  });
  const {
    selectedWorkflowGraphNodeId,
    clearWorkflowSourceDraft,
    setWorkflowArtifactPanel,
    setWorkflowRunsPanel,
    setWorkflowBuildPanel,
  } = workflowWorkspaceController;
  const [taskProjectPath, setTaskProjectPath] = useState(activeProjectPath);
  const scheduleController = useAutomationScheduleController({
    activeThreadId,
    workspacePath,
    createPermissionGrantTargetHash,
  });
  const localTaskController = useAutomationsLocalTaskController({
    refreshAutomationFolders,
    loadAutoDispatchStatus,
    onOrchestrationBoardChanged: setOrchestrationBoard,
    onOrchestrationErrorChanged: setOrchestrationError,
    onAutoDispatchStatusChanged: setAutoDispatchStatus,
  });
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
    setWorkflowExplorationTracesByThreadId,
    workflowDetailRunIdRef,
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
  const { workflowDiscoveryBusy } = workflowDiscoveryController;
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
  const { answerWorkflowRuntimeInput, resumeWorkflowTotalRuntimePause, recoverWorkflowRun, debugRewriteWorkflowRun } =
    workflowArtifactController;
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
  const { loadWorkflowThreadChatMessages } = workflowThreadController;

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

  return {
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
    selectedWorkflowGraphNodeId,
    setOrchestrationError,
    setTaskProjectPath,
    setWorkflowArtifactPanel,
    setWorkflowBuildPanel,
    setWorkflowBusy,
    setWorkflowError,
    setWorkflowRunsPanel,
    taskById,
    taskProjectPath,
    visibleTaskRuns,
    visibleTasks,
    visibleThreads,
    workflowArtifactController,
    workflowBusy,
    workflowDashboard,
    workflowDashboardController,
    workflowDetail,
    workflowDiscoveryController,
    workflowError,
    workflowLabController,
    workflowRecordingLibraryController,
    workflowRunIdleTimeoutMs,
    workflowRunTotalLimitMode,
    workflowRuns,
    workflowAgentThreadByArtifactId,
    workflowAgentThreadById,
    workflowThreadController,
    workflowWorkspaceController,
    setWorkflowRunIdleTimeoutMs,
    setWorkflowRunTotalLimitMode,
  };
}
