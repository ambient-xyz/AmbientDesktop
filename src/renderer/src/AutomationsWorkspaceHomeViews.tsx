import type { ReactNode } from "react";
import type { AutomationThreadSummary } from "../../shared/automationTypes";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary } from "../../shared/workflowTypes";
import {
  WorkflowRecordingPlaybookLibrarySection,
  type WorkflowRecordingPlaybookLibrarySectionProps,
} from "./AutomationsWorkflowPlaybookViews";
import {
  AutomationHomePane,
  AutomationRunsReviewsPane,
  automationThreadStatusGroups,
  type AutomationHomePaneProps,
  type AutomationRunsReviewsPaneProps,
} from "./AutomationsWorkflowUtilityViews";
import { AutomationWorkspaceTabs, type AutomationPane, type AutomationWorkspaceTab } from "./AutomationsWorkspaceShellViews";

export type AutomationsWorkspaceHomePaneProps = WorkflowRecordingPlaybookLibrarySectionProps & {
  allAutomationThreads: AutomationThreadSummary[];
  homeExplainer: AutomationHomePaneProps["homeExplainer"];
  legacyCompilerEnabled: boolean;
  newWorkflowLabel: string;
  reviewTooltip: string;
  routeDetailForThread: AutomationHomePaneProps["routeDetailForThread"];
  onOpenThread: AutomationHomePaneProps["onOpenThread"];
  onSelectPane: AutomationHomePaneProps["onSelectPane"];
};

export function AutomationsWorkspaceHomePane({
  allAutomationThreads,
  homeExplainer,
  legacyCompilerEnabled,
  newWorkflowLabel,
  reviewTooltip,
  routeDetailForThread,
  onOpenThread,
  onSelectPane,
  playbooks,
  query,
  includeArchived,
  refreshing,
  exportBusyThreadId,
  exportStatus,
  onQueryChange,
  onIncludeArchivedChange,
  onRefresh,
  onEditPlaybook,
  onOpenPlaybook,
  onPreviewLocalPath,
  onExportPlaybookSession,
  onRestoreVersion,
  onSetEnabled,
  onUnarchivePlaybook,
  onArchivePlaybook,
}: AutomationsWorkspaceHomePaneProps) {
  const threadGroups = automationThreadStatusGroups(allAutomationThreads);
  return (
    <AutomationHomePane
      homeExplainer={homeExplainer}
      legacyCompilerEnabled={legacyCompilerEnabled}
      newWorkflowLabel={newWorkflowLabel}
      threadGroups={threadGroups}
      reviewTooltip={reviewTooltip}
      routeDetailForThread={routeDetailForThread}
      onOpenThread={onOpenThread}
      onSelectPane={onSelectPane}
      playbookLibrary={
        !legacyCompilerEnabled ? (
          <WorkflowRecordingPlaybookLibrarySection
            playbooks={playbooks}
            query={query}
            includeArchived={includeArchived}
            refreshing={refreshing}
            exportBusyThreadId={exportBusyThreadId}
            exportStatus={exportStatus}
            onQueryChange={onQueryChange}
            onIncludeArchivedChange={onIncludeArchivedChange}
            onRefresh={onRefresh}
            onEditPlaybook={onEditPlaybook}
            onOpenPlaybook={onOpenPlaybook}
            onPreviewLocalPath={onPreviewLocalPath}
            onExportPlaybookSession={onExportPlaybookSession}
            onRestoreVersion={onRestoreVersion}
            onSetEnabled={onSetEnabled}
            onUnarchivePlaybook={onUnarchivePlaybook}
            onArchivePlaybook={onArchivePlaybook}
          />
        ) : undefined
      }
    />
  );
}

export function AutomationsWorkspaceTabsView({
  homeTitle,
  homeTooltip,
  localTasksTooltip,
  workflowAgentLabel,
  workflowAgentTooltip,
  workflowLabTooltip,
  schedulesTooltip,
  runsReviewsTooltip,
  activePane,
  selectedThreadActive,
  onSelectPane,
}: {
  homeTitle: string;
  homeTooltip: string;
  localTasksTooltip: string;
  workflowAgentLabel: string;
  workflowAgentTooltip: string;
  workflowLabTooltip: string;
  schedulesTooltip: string;
  runsReviewsTooltip: string;
  activePane: AutomationPane;
  selectedThreadActive: boolean;
  onSelectPane: (pane: AutomationPane) => void;
}) {
  const tabs: AutomationWorkspaceTab[] = [
    { id: "home", label: "Home", title: homeTooltip },
    { id: "local_tasks", label: "Local Tasks", title: localTasksTooltip },
    { id: "workflow_agent", label: workflowAgentLabel, title: workflowAgentTooltip },
    { id: "workflow_lab", label: "Workflow Lab", title: workflowLabTooltip },
    { id: "schedules", label: "Schedules", title: schedulesTooltip },
    { id: "runs_reviews", label: "Runs", title: runsReviewsTooltip },
  ];
  return (
    <AutomationWorkspaceTabs
      homeTitle={homeTitle}
      tabs={tabs}
      activePane={activePane}
      selectedThreadActive={selectedThreadActive}
      onSelectPane={onSelectPane}
    />
  );
}

export function AutomationsWorkspaceRunsReviewsPane({
  selectedWorkflowAgentThread,
  selectedWorkflowAgentArtifact,
  legacyCompilerEnabled,
  allAutomationThreads,
  reviewTooltip,
  localTaskRuns,
  workflowRuns,
  workflowConsole,
  routeDetailForThread,
  onOpenThread,
  renderWorkflowThreadRunsPane,
  renderLegacyWorkflowHiddenPane,
}: {
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  selectedWorkflowAgentArtifact?: WorkflowArtifactSummary;
  legacyCompilerEnabled: boolean;
  allAutomationThreads: AutomationThreadSummary[];
  reviewTooltip: string;
  localTaskRuns: ReactNode;
  workflowRuns: ReactNode;
  workflowConsole: ReactNode;
  routeDetailForThread: AutomationRunsReviewsPaneProps["routeDetailForThread"];
  onOpenThread: AutomationRunsReviewsPaneProps["onOpenThread"];
  renderWorkflowThreadRunsPane: (thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) => ReactNode;
  renderLegacyWorkflowHiddenPane: (thread: WorkflowAgentThreadSummary) => ReactNode;
}) {
  if (selectedWorkflowAgentThread) {
    return legacyCompilerEnabled
      ? renderWorkflowThreadRunsPane(selectedWorkflowAgentThread, selectedWorkflowAgentArtifact)
      : renderLegacyWorkflowHiddenPane(selectedWorkflowAgentThread);
  }
  const threadGroups = automationThreadStatusGroups(allAutomationThreads);
  return (
    <AutomationRunsReviewsPane
      threadGroups={threadGroups}
      reviewTooltip={reviewTooltip}
      localTaskRuns={localTaskRuns}
      workflowRuns={workflowRuns}
      workflowConsole={workflowConsole}
      routeDetailForThread={routeDetailForThread}
      onOpenThread={onOpenThread}
    />
  );
}
