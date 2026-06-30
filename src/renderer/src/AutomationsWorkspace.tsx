import { AutomationsWorkspaceTabsView } from "./AutomationsWorkspaceHomeViews";
import {
  activePaneTooltip,
  automationHeadingTooltips,
  automationHelpText,
  useAutomationsWorkspaceControllerGraph,
  workflowRecorderSurface,
} from "./AutomationsWorkspaceControllerGraph";
import type { AutomationsWorkspaceProps } from "./AutomationsWorkspaceTypes";
import { AutomationWorkspaceHeader } from "./AutomationsWorkspaceShellViews";
import "./styles.css";

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
  workflowDiscoveryLiveStatusSubtitle,
  workflowDiscoveryLiveStatusTitle,
  workflowDiscoveryProgressDetail,
  WorkflowDiscoveryQuestionView,
  WorkflowDiscoverySummary,
  WorkflowDiscoveryThreadWorkspace,
  WorkflowRequestEditor,
  WorkflowRevisionPanel,
} from "./AutomationsWorkflowDiscoveryViews";
export { WorkflowDiscoveryContextReview } from "./AutomationsWorkflowDiscoveryContextReviewView";
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
export {
  activePaneTooltip,
  automationHeadingTooltips,
  automationHelpText,
  automationPaneTitle,
  rendererPermissionGrantTargetHash,
  workflowArtifactRunBlocked,
  workflowAuditReportPreview,
  workflowRecorderSurface,
} from "./AutomationsWorkspaceControllerGraph";
export type { AutomationsWorkspaceProps } from "./AutomationsWorkspaceTypes";

export function AutomationsWorkspace(props: AutomationsWorkspaceProps) {
  const { activePane, selectedThread, onSelectPane } = props;
  const { automationHeaderModel, automationShellModel, renderAutomationPane, renderSelectedThreadDetail } =
    useAutomationsWorkspaceControllerGraph(props);

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

      {selectedThread ? renderSelectedThreadDetail() : <>{renderAutomationPane()}</>}
    </section>
  );
}
