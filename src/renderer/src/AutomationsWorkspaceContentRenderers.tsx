import type { ComponentProps, ReactNode } from "react";
import type { AutomationThreadSummary } from "../../shared/automationTypes";
import type { OrchestrationRun, WorkflowRunDetail, WorkflowRunSummary } from "../../shared/workflowTypes";
import {
  AutomationsWorkspaceHomePane,
  AutomationsWorkspaceRunsReviewsPane,
} from "./AutomationsWorkspaceHomeViews";
import { AutomationPaneRouter, type AutomationPane } from "./AutomationsWorkspaceShellViews";
import { AutomationSelectedThreadDetailView } from "./AutomationsThreadDetailViews";

type HomePaneProps = ComponentProps<typeof AutomationsWorkspaceHomePane>;
type RunsReviewsPaneProps = ComponentProps<typeof AutomationsWorkspaceRunsReviewsPane>;
type SelectedThreadDetailProps = ComponentProps<typeof AutomationSelectedThreadDetailView>;

type AutomationsWorkspaceLocalTaskRenderers = {
  renderFolderPane: () => ReactNode;
  renderLocalTasksPane: () => ReactNode;
  renderTaskRuns: (runs: OrchestrationRun[], limit?: number) => ReactNode;
};

type AutomationsWorkspaceScheduleRenderers = {
  renderSchedulesPane: () => ReactNode;
  renderWorkflowRunCards: (runs: WorkflowRunSummary[], limit?: number) => ReactNode;
};

type AutomationsWorkspaceArtifactPanelRenderers = {
  renderRunConsole: (detail: WorkflowRunDetail | undefined, compact?: boolean) => ReactNode;
};

export type AutomationsWorkspaceSelectedThreadDetailInput = Omit<SelectedThreadDetailProps, "selectedThread"> & {
  selectedThread?: SelectedThreadDetailProps["selectedThread"];
};

export type AutomationsWorkspaceContentRenderersInput = {
  activePane: AutomationPane;
  selectedWorkflowRecording?: HomePaneProps["playbooks"][number];
  selectedWorkflowAgentThread?: RunsReviewsPaneProps["selectedWorkflowAgentThread"];
  selectedWorkflowAgentArtifact?: RunsReviewsPaneProps["selectedWorkflowAgentArtifact"];
  legacyCompilerEnabled: boolean;
  allAutomationThreads: AutomationThreadSummary[];
  allTaskRuns: OrchestrationRun[];
  workflowRuns: WorkflowRunSummary[];
  workflowDetail?: WorkflowRunDetail;
  reviewTooltip: string;
  routeDetailForThread: HomePaneProps["routeDetailForThread"];
  homePane: Omit<
    HomePaneProps,
    "allAutomationThreads" | "legacyCompilerEnabled" | "reviewTooltip" | "routeDetailForThread" | "onOpenThread" | "onSelectPane"
  >;
  selectedThreadDetail: AutomationsWorkspaceSelectedThreadDetailInput;
  renderers: {
    localTaskPaneRenderers: AutomationsWorkspaceLocalTaskRenderers;
    schedulePaneRenderers: AutomationsWorkspaceScheduleRenderers;
    workflowArtifactPanels: AutomationsWorkspaceArtifactPanelRenderers;
    renderLegacyWorkflowHiddenPane: RunsReviewsPaneProps["renderLegacyWorkflowHiddenPane"];
    renderWorkflowAgentPane: () => ReactNode;
    renderWorkflowLabHomePane: () => ReactNode;
    renderWorkflowRecordingPlaybookPane: (recording: NonNullable<HomePaneProps["playbooks"][number]>) => ReactNode;
    renderWorkflowThreadRunsPane: RunsReviewsPaneProps["renderWorkflowThreadRunsPane"];
  };
  actions: {
    onOpenThread: HomePaneProps["onOpenThread"];
    onSelectPane: HomePaneProps["onSelectPane"];
  };
};

export function createAutomationsWorkspaceContentRenderers(input: AutomationsWorkspaceContentRenderersInput) {
  function renderAutomationPane() {
    const { localTaskPaneRenderers, schedulePaneRenderers, workflowArtifactPanels } = input.renderers;
    return (
      <AutomationPaneRouter
        activePane={input.activePane}
        selectedWorkflowRecordingActive={Boolean(input.selectedWorkflowRecording)}
        renderWorkflowRecordingPlaybookPane={() =>
          input.selectedWorkflowRecording ? input.renderers.renderWorkflowRecordingPlaybookPane(input.selectedWorkflowRecording) : null
        }
        renderLocalTasksPane={localTaskPaneRenderers.renderLocalTasksPane}
        renderWorkflowAgentPane={input.renderers.renderWorkflowAgentPane}
        renderWorkflowLabHomePane={input.renderers.renderWorkflowLabHomePane}
        renderSchedulesPane={schedulePaneRenderers.renderSchedulesPane}
        renderRunsReviewsPane={() => (
          <AutomationsWorkspaceRunsReviewsPane
            selectedWorkflowAgentThread={input.selectedWorkflowAgentThread}
            selectedWorkflowAgentArtifact={input.selectedWorkflowAgentArtifact}
            legacyCompilerEnabled={input.legacyCompilerEnabled}
            allAutomationThreads={input.allAutomationThreads}
            reviewTooltip={input.reviewTooltip}
            localTaskRuns={localTaskPaneRenderers.renderTaskRuns(input.allTaskRuns, 8)}
            workflowRuns={schedulePaneRenderers.renderWorkflowRunCards(input.workflowRuns, 8)}
            workflowConsole={workflowArtifactPanels.renderRunConsole(input.workflowDetail)}
            routeDetailForThread={input.routeDetailForThread}
            onOpenThread={input.actions.onOpenThread}
            renderWorkflowThreadRunsPane={input.renderers.renderWorkflowThreadRunsPane}
            renderLegacyWorkflowHiddenPane={input.renderers.renderLegacyWorkflowHiddenPane}
          />
        )}
        renderFolderPane={localTaskPaneRenderers.renderFolderPane}
        renderHomePane={() => (
          <AutomationsWorkspaceHomePane
            {...input.homePane}
            allAutomationThreads={input.allAutomationThreads}
            legacyCompilerEnabled={input.legacyCompilerEnabled}
            reviewTooltip={input.reviewTooltip}
            routeDetailForThread={input.routeDetailForThread}
            onOpenThread={input.actions.onOpenThread}
            onSelectPane={input.actions.onSelectPane}
          />
        )}
      />
    );
  }

  function renderSelectedThreadDetail() {
    const { selectedThread, ...detailProps } = input.selectedThreadDetail;
    if (!selectedThread) return null;
    return <AutomationSelectedThreadDetailView selectedThread={selectedThread} {...detailProps} />;
  }

  return { renderAutomationPane, renderSelectedThreadDetail };
}
