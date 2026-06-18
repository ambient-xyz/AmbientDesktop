import type { AutomationThreadSummary } from "../../shared/automationTypes";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary } from "../../shared/workflowTypes";
import {
  automationWorkspaceThreadForArtifact,
  type AutomationWorkspaceSelectionModel,
} from "./automationWorkspaceSelectionModel";
import type { AutomationPane } from "./AutomationsWorkspaceShellViews";
import {
  focusWorkflowPanelSelector,
  workflowPanelFocusSelectorForArtifactPanel,
  workflowPersistentStatusTargetRoute,
} from "./AutomationsWorkflowPanelRouting";
import type {
  WorkflowArtifactPanelId,
  WorkflowBuildPanelId,
} from "./workflowArtifactPanelUiModel";
import type { WorkflowPersistentStatusTarget } from "./workflowPersistentStatusUiModel";
import type { WorkflowSchedulePanelId } from "./workflowReviewUiModel";
import type { WorkflowRunsPanelId } from "./workflowRunsPanelUiModel";
import { workflowArtifactThreadRoute } from "./workflowThreadFirstUiModel";

export type AutomationsWorkflowNavigationSelection = Pick<
  AutomationWorkspaceSelectionModel,
  "artifactById" | "workflowAgentThreadByArtifactId" | "workflowAgentThreadById"
>;

export type AutomationsWorkflowNavigationActions = {
  onSelectPane: (pane: AutomationPane) => void;
  onSelectThread: (thread: AutomationThreadSummary) => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  selectWorkflowAgentThreadForArtifact: (artifact?: WorkflowArtifactSummary) => Promise<void>;
  setWorkflowArtifactPanel: (workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) => void;
  setWorkflowBuildPanel: (workflowThreadId: string | undefined, panel: WorkflowBuildPanelId) => void;
  setWorkflowRunsPanel: (workflowThreadId: string | undefined, panel: WorkflowRunsPanelId) => void;
  setWorkflowSchedulePanel: (panel: WorkflowSchedulePanelId) => void;
};

export type AutomationsWorkflowNavigationControllerInput = {
  actions: AutomationsWorkflowNavigationActions;
  focusPanelSelector?: (selector: string) => void;
  selection: AutomationsWorkflowNavigationSelection;
};

export function workflowAgentThreadForNavigationArtifact(
  selection: AutomationsWorkflowNavigationSelection,
  artifact?: WorkflowArtifactSummary,
  artifactId?: string,
): WorkflowAgentThreadSummary | undefined {
  return automationWorkspaceThreadForArtifact(selection, artifact, artifactId);
}

export function automationThreadRouteDetailForNavigation(
  selection: AutomationsWorkflowNavigationSelection,
  thread: AutomationThreadSummary,
): string | undefined {
  if (thread.kind !== "workflow_artifact") return undefined;
  const artifact = selection.artifactById.get(thread.sourceId);
  return workflowArtifactThreadRoute({
    artifact,
    workflowThread: workflowAgentThreadForNavigationArtifact(selection, artifact, thread.sourceId),
  }).detail;
}

export function createAutomationsWorkflowNavigationController({
  actions,
  focusPanelSelector = focusWorkflowPanelSelector,
  selection,
}: AutomationsWorkflowNavigationControllerInput) {
  function openWorkflowPanelFromTranscript(workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) {
    if (!workflowThreadId) return;
    actions.setWorkflowArtifactPanel(workflowThreadId, panel);
    focusPanelSelector(workflowPanelFocusSelectorForArtifactPanel(panel));
  }

  function openWorkflowPersistentStatusTarget(workflowThreadId: string | undefined, target: WorkflowPersistentStatusTarget) {
    if (!workflowThreadId) return;
    const route = workflowPersistentStatusTargetRoute(target);
    if (route.buildPanel) actions.setWorkflowBuildPanel(workflowThreadId, route.buildPanel);
    if (route.runsPanel) actions.setWorkflowRunsPanel(workflowThreadId, route.runsPanel);
    if (route.artifactPanel) actions.setWorkflowArtifactPanel(workflowThreadId, route.artifactPanel);
    if (route.schedulePanel) actions.setWorkflowSchedulePanel(route.schedulePanel);
    if (route.selectPane === "schedules") actions.onSelectPane("schedules");
    focusPanelSelector(route.focusSelector);
  }

  function workflowAgentThreadForArtifact(artifact?: WorkflowArtifactSummary, artifactId?: string) {
    return workflowAgentThreadForNavigationArtifact(selection, artifact, artifactId);
  }

  async function openWorkflowArtifactThread(artifact?: WorkflowArtifactSummary, artifactId?: string) {
    const loadedThread = workflowAgentThreadForArtifact(artifact, artifactId);
    if (loadedThread) {
      actions.onSelectWorkflowAgentThread(loadedThread);
      return;
    }
    if (!artifact?.workflowThreadId) return;
    await actions.selectWorkflowAgentThreadForArtifact(artifact);
  }

  function openAutomationThreadCard(thread: AutomationThreadSummary) {
    if (thread.kind === "workflow_artifact") {
      const artifact = selection.artifactById.get(thread.sourceId);
      const loadedThread = workflowAgentThreadForArtifact(artifact, thread.sourceId);
      if (loadedThread) {
        actions.onSelectWorkflowAgentThread(loadedThread);
        return;
      }
      if (artifact?.workflowThreadId) {
        void openWorkflowArtifactThread(artifact);
        return;
      }
    }
    actions.onSelectThread(thread);
  }

  function automationThreadRouteDetail(thread: AutomationThreadSummary): string | undefined {
    return automationThreadRouteDetailForNavigation(selection, thread);
  }

  return {
    automationThreadRouteDetail,
    openAutomationThreadCard,
    openWorkflowArtifactThread,
    openWorkflowPanelFromTranscript,
    openWorkflowPersistentStatusTarget,
    workflowAgentThreadForArtifact,
  };
}
